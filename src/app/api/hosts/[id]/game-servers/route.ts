import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameServers, hosts, supportedGames, gameServerLogs, tunnels } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { dispatchCommand } from "@/lib/agent-hub";
import { resolveEgg, type EggJson, type EggInstall } from "@/lib/eggs";
import { allocateTunnel } from "@/lib/tunnels";
import { recordAudit, sourceIpFromRequest } from "@/lib/audit";

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [host] = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .limit(1);
  if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Left join tunnels so the UI can display public address where it
  // exists and "Not yet published" where it doesn't.
  const rows = await db
    .select({
      gs: gameServers,
      tunnel: tunnels,
    })
    .from(gameServers)
    .leftJoin(tunnels, eq(tunnels.gameServerId, gameServers.id))
    .where(eq(gameServers.hostId, id))
    .orderBy(gameServers.createdAt);

  return NextResponse.json({
    gameServers: rows.map((r) => ({
      ...r.gs,
      tunnel: r.tunnel ?? null,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const gameId = String(body.gameId ?? "");
  const name = String(body.name ?? "").trim();
  const portRaw = Number(body.port);

  if (!gameId || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const [host] = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .limit(1);
  if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [game] = await db
    .select()
    .from(supportedGames)
    .where(eq(supportedGames.id, gameId))
    .limit(1);
  if (!game) {
    return NextResponse.json({ error: "Unknown game" }, { status: 400 });
  }
  if (!game.available) {
    return NextResponse.json(
      { error: `${game.name} isn't available yet in this MVP.` },
      { status: 400 },
    );
  }

  const port =
    Number.isInteger(portRaw) && portRaw > 0 && portRaw < 65536
      ? portRaw
      : game.defaultPort;

  // PROJECT.md §3.9 — apply per-server resource caps. Clamp the values
  // the user can request so a typo can't request 1 EiB of memory.
  const memMaxMb = clampInt(
    Number(body.memMaxMb),
    256,
    65536,
    /* default */ 4096,
  );
  const cpuPct = clampInt(
    Number(body.cpuPct),
    25,
    /* up to all cores */ 1600,
    /* default ~ 2 cores */ 200,
  );

  const [server] = await db
    .insert(gameServers)
    .values({
      hostId: id,
      userId: user.id,
      name,
      gameId,
      status: "queued",
      port,
      maxPlayers: game.defaultMaxPlayers,
      memMaxMb,
      cpuPct,
    })
    .returning();

  await db.insert(gameServerLogs).values({
    gameServerId: server.id,
    source: "system",
    level: "info",
    message: `Server "${name}" queued for deployment.`,
  });

  // Resolve the egg (if any) or fall back to the legacy startup/SteamCMD
  // pair. The agent receives a fully-resolved, shell-ready startup command
  // and an explicit install spec; it doesn't need to know about eggs.
  const egg = game.eggJson as EggJson | null;
  let startup: string;
  let install: EggInstall | null = null;
  let bootstrapFiles: Record<string, string> = {};

  if (egg) {
    const resolved = resolveEgg(egg, {
      serverId: server.id,
      serverName: server.name,
      port: server.port,
    });
    startup = resolved.startup;
    install = resolved.install;
    bootstrapFiles = resolved.bootstrapFiles;
  } else {
    startup = game.startupCommand
      .replace(/\{PORT\}/g, String(server.port))
      .replace(/\{SERVER_NAME\}/g, server.name);
    if (game.steamAppId != null) {
      install = { kind: "steamcmd", app_id: game.steamAppId };
    }
  }

  // Allocate the external-facing TCP relay entry (ADR 0001 Option A).
  // The tunnels row is written now so the UI can display the public
  // address as soon as the deploy POST returns. The ws-server TCP
  // listener binds on `begin_tunnel` below.
  let tunnel: Awaited<ReturnType<typeof allocateTunnel>> | null = null;
  try {
    tunnel = await allocateTunnel(server.id);
  } catch (err) {
    await db.insert(gameServerLogs).values({
      gameServerId: server.id,
      source: "system",
      level: "warn",
      message: `Tunnel allocation failed: ${(err as Error).message}`,
    });
  }

  const delivered = await dispatchCommand(id, {
    type: "deploy_game_server",
    gameServer: {
      id: server.id,
      name: server.name,
      gameId: server.gameId,
      port: server.port,
      // Fully resolved — no more {PORT} / {SERVER_NAME} / {{VAR}} left.
      startupCommand: startup,
      // New structured install step. Legacy agents ignore unknown fields.
      install,
      bootstrapFiles,
      // PROJECT.md §3.9 best-effort resource caps the agent applies via
      // prlimit + nice. Older agents ignore these silently.
      limits: { memMaxMb, cpuPct },
      // Kept for backward-compat with older agent.cjs bundles still in the
      // wild that read steamAppId directly; safe to remove once everyone
      // has pulled a post-Phase-2 build.
      steamAppId: install?.kind === "steamcmd" ? install.app_id : null,
    },
  });
  if (!delivered) {
    await db.insert(gameServerLogs).values({
      gameServerId: server.id,
      source: "system",
      level: "warn",
      message:
        "Host agent is offline. Deployment will start once the agent reconnects.",
    });
  }

  // Kick the relay: have the ws-server bind the public port and ask the
  // agent to stand up its local-side dialer. Independent of the installer
  // having finished — first clients just won't get a TCP response from
  // the not-yet-running game server until it's up.
  if (tunnel) {
    await dispatchCommand(id, {
      type: "begin_tunnel",
      tunnel: {
        id: tunnel.id,
        gameServerId: server.id,
        internalPort: server.port,
      },
    });
  }

  await recordAudit({
    hostId: id,
    userId: user.id,
    kind: "game_server_deploy",
    target: server.name,
    details: {
      gameServerId: server.id,
      gameId: server.gameId,
      port: server.port,
    },
    sourceIp: sourceIpFromRequest(req),
  });

  return NextResponse.json({ gameServer: server });
}
