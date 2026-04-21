import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameServers, hosts, supportedGames, gameServerLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { sendCommand, isAgentConnected } from "@/lib/agent-hub";

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

  const rows = await db
    .select()
    .from(gameServers)
    .where(eq(gameServers.hostId, id))
    .orderBy(gameServers.createdAt);

  return NextResponse.json({ gameServers: rows });
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

  const port =
    Number.isInteger(portRaw) && portRaw > 0 && portRaw < 65536
      ? portRaw
      : game.defaultPort;

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
    })
    .returning();

  await db.insert(gameServerLogs).values({
    gameServerId: server.id,
    source: "system",
    level: "info",
    message: `Server "${name}" queued for deployment.`,
  });

  if (isAgentConnected(id)) {
    sendCommand(id, {
      type: "deploy_game_server",
      gameServer: {
        id: server.id,
        name: server.name,
        gameId: server.gameId,
        steamAppId: game.steamAppId,
        port: server.port,
        startupCommand: game.startupCommand,
      },
    });
  } else {
    await db.insert(gameServerLogs).values({
      gameServerId: server.id,
      source: "system",
      level: "warn",
      message:
        "Host agent is offline. Deployment will start once the agent reconnects.",
    });
  }

  return NextResponse.json({ gameServer: server });
}
