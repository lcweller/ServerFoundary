import { createHash } from "crypto";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  hosts,
  gameServers,
  gameServerLogs,
  sessions,
  users,
} from "@/db/schema";
import {
  registerAgent,
  unregisterAgent,
  emitAgentMessage,
  sendCommand,
} from "@/lib/agent-hub";
import { hashToken, SESSION_COOKIE } from "@/lib/auth";
import {
  deliverToExternal,
  closeExternal,
  resendTunnelsForHost,
} from "@/lib/tunnel-manager";
import { recordHeartbeat } from "@/lib/metrics";
import { recordAudit } from "@/lib/audit";
import {
  applyAgentBackupUpdate,
  getBackupConfig,
  pruneSuccessfulBackups,
  startBackupScheduler,
} from "@/lib/backups";

type AgentMessage =
  | {
      type: "heartbeat";
      metrics?: Record<string, unknown>;
      agent_version?: string;
      environment?: Record<string, unknown>;
      game_servers?: Array<{
        id: string;
        status: string;
        players?: number;
        port?: number;
      }>;
    }
  | {
      type: "game_server_status";
      gameServerId: string;
      status: string;
      players?: number;
      maxPlayers?: number;
    }
  | {
      type: "log";
      gameServerId?: string;
      source?: string;
      level?: string;
      message?: string;
    }
  | {
      type: "terminal_output";
      sessionId: string;
      data: string;
    }
  | {
      type: "terminal_closed";
      sessionId: string;
    }
  | {
      type: "adopt_servers";
      servers?: Array<{
        id: string;
        name: string;
        gameId: string;
        steamAppId: number | null;
        port: number;
        startupCommand: string;
      }>;
    }
  | {
      // Agent → platform: bytes from the local game-server socket for
      // a specific in-flight connection.
      type: "tunnel_data";
      tunnelId: string;
      connId: string;
      b64: string;
    }
  | {
      // Agent → platform: the local-side TCP socket just closed.
      type: "tunnel_close";
      tunnelId: string;
      connId: string;
    }
  | {
      // Agent → platform: backup lifecycle. `running` and `success|failed`
      // are emitted from the agent during/after tar.gz creation.
      type: "backup_status";
      backupId: string;
      gameServerId: string;
      status: "running" | "success" | "failed";
      path?: string;
      sizeBytes?: number;
      error?: string;
    }
  | {
      // Agent → platform: restore lifecycle.
      type: "backup_restore_status";
      backupId: string;
      gameServerId: string;
      status: "running" | "success" | "failed";
      error?: string;
    };

let started = false;
let agentWss: WebSocketServer | null = null;
let terminalWss: WebSocketServer | null = null;

// Per-host pending terminal sessions on the dashboard side, keyed by sessionId.
const browserSessions = new Map<string, WebSocket>();

/**
 * Idempotently attach WebSocket handlers to the given HTTP server.
 * Must be called by the custom Next.js server on boot.
 */
export function initWsServer(server: {
  on(ev: "upgrade", cb: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): void;
}) {
  if (started) return;
  started = true;

  agentWss = new WebSocketServer({ noServer: true });
  terminalWss = new WebSocketServer({ noServer: true });

  agentWss.on("connection", handleAgentConnection);
  terminalWss.on("connection", handleTerminalConnection);

  // PROJECT.md §3.10 — fire scheduled backups from the ws-server process
  // because that's where dispatchCommand can talk to live agents in
  // memory (no internal-HTTP hop). One tick per minute.
  startBackupScheduler();

  server.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

      if (url.pathname === "/api/v1/agent/ws") {
        const auth = req.headers.authorization ?? "";
        const match = /^Bearer\s+(.+)$/.exec(auth);
        if (!match) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        const keyHash = createHash("sha256").update(match[1]).digest("hex");
        const [host] = await db
          .select()
          .from(hosts)
          .where(eq(hosts.apiKeyHash, keyHash))
          .limit(1);
        if (!host) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        agentWss!.handleUpgrade(req, socket, head, (ws) => {
          (ws as unknown as { hostId: string }).hostId = host.id;
          agentWss!.emit("connection", ws, req);
        });
        return;
      }

      if (url.pathname.startsWith("/api/v1/terminal/")) {
        const hostId = url.pathname.replace("/api/v1/terminal/", "");
        const cookieHeader = req.headers.cookie ?? "";
        const cookies = Object.fromEntries(
          cookieHeader
            .split(";")
            .map((c) => c.trim().split("="))
            .filter(([k, v]) => k && v !== undefined),
        ) as Record<string, string>;
        const token = cookies[SESSION_COOKIE];
        if (!token) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        const id = hashToken(token);
        const [row] = await db
          .select({ userId: sessions.userId, expiresAt: sessions.expiresAt })
          .from(sessions)
          .innerJoin(users, eq(sessions.userId, users.id))
          .where(eq(sessions.id, id))
          .limit(1);
        if (!row || row.expiresAt.getTime() < Date.now()) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        const [host] = await db
          .select({
            id: hosts.id,
            userId: hosts.userId,
            terminalEnabled: hosts.terminalEnabled,
          })
          .from(hosts)
          .where(eq(hosts.id, hostId))
          .limit(1);
        if (!host || host.userId !== row.userId) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
          return;
        }
        // PROJECT.md §3.6 — terminal is opt-in per host. Refuse the
        // upgrade with a clear status if the owner hasn't toggled it on.
        if (!host.terminalEnabled) {
          socket.write(
            "HTTP/1.1 403 Forbidden\r\n" +
              "Content-Type: text/plain\r\n" +
              "Connection: close\r\n\r\n" +
              "Remote terminal is disabled for this host. Enable it in Settings.\r\n",
          );
          socket.destroy();
          return;
        }
        const sourceIp =
          (req.headers["cf-connecting-ip"] as string | undefined) ??
          (req.headers["x-forwarded-for"] as string | undefined)
            ?.split(",")[0]
            ?.trim() ??
          req.socket.remoteAddress ??
          null;
        terminalWss!.handleUpgrade(req, socket, head, (ws) => {
          (ws as unknown as { hostId: string }).hostId = hostId;
          (ws as unknown as { userId: string }).userId = row.userId;
          (ws as unknown as { sourceIp: string | null }).sourceIp = sourceIp;
          terminalWss!.emit("connection", ws, req);
        });
        return;
      }
    } catch (err) {
      console.error("[ws] upgrade error", err);
      try {
        socket.destroy();
      } catch {}
    }
  });
}

async function handleAgentConnection(ws: WebSocket) {
  const hostId = (ws as unknown as { hostId: string }).hostId;

  registerAgent(hostId, (msg) => {
    if (ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  });

  await db
    .update(hosts)
    .set({ status: "online", lastHeartbeatAt: new Date() })
    .where(eq(hosts.id, hostId));

  console.log(`[agent] connected host=${hostId}`);

  // The agent just came up with no in-flight connId state. Resync the
  // public TCP listeners and tell the agent to prepare local dialers for
  // each of its host's tunnels. (Idempotent on both sides.)
  resendTunnelsForHost(hostId).catch((err) =>
    console.warn(
      `[tunnel] resendTunnelsForHost(${hostId}) failed:`,
      (err as Error).message,
    ),
  );

  ws.on("message", async (raw) => {
    let msg: AgentMessage;
    try {
      msg = JSON.parse(raw.toString()) as AgentMessage;
    } catch {
      return;
    }
    try {
      await handleAgentMessage(hostId, msg);
      emitAgentMessage(hostId, msg);
    } catch (err) {
      console.error("[agent] error handling message", err);
    }
  });

  ws.on("close", async () => {
    unregisterAgent(hostId);
    await db
      .update(hosts)
      .set({ status: "offline" })
      .where(eq(hosts.id, hostId));
    console.log(`[agent] disconnected host=${hostId}`);
  });

  ws.on("error", (err) => {
    console.error("[agent] socket error", err);
  });
}

async function handleAgentMessage(hostId: string, msg: AgentMessage) {
  switch (msg.type) {
    case "heartbeat": {
      await db
        .update(hosts)
        .set({
          status: "online",
          lastHeartbeatAt: new Date(),
          metrics: msg.metrics ?? null,
          environment: msg.environment ?? null,
          agentVersion: msg.agent_version ?? null,
          ...(ipFromMetrics(msg.metrics)
            ? { ipAddress: ipFromMetrics(msg.metrics) }
            : {}),
        })
        .where(eq(hosts.id, hostId));
      if (Array.isArray(msg.game_servers)) {
        for (const gs of msg.game_servers) {
          await db
            .update(gameServers)
            .set({
              status: gs.status,
              playersOnline: gs.players ?? 0,
              updatedAt: new Date(),
            })
            .where(eq(gameServers.id, gs.id));
        }
      }
      // Fire-and-forget: roll this sample into the minutely + hourly
      // aggregate tables. A DB hiccup shouldn't disturb the live
      // heartbeat pipeline (§3.3).
      recordHeartbeat(hostId, msg.metrics).catch((err) =>
        console.warn("[metrics] recordHeartbeat failed:", (err as Error).message),
      );
      break;
    }
    case "game_server_status": {
      await db
        .update(gameServers)
        .set({
          status: msg.status,
          playersOnline: msg.players ?? 0,
          ...(msg.maxPlayers ? { maxPlayers: msg.maxPlayers } : {}),
          updatedAt: new Date(),
        })
        .where(eq(gameServers.id, msg.gameServerId));
      break;
    }
    case "log": {
      if (msg.gameServerId) {
        await db.insert(gameServerLogs).values({
          gameServerId: msg.gameServerId,
          source: msg.source ?? "agent",
          level: msg.level ?? "info",
          message: msg.message ?? "",
        });
      }
      break;
    }
    case "terminal_output": {
      const ws = browserSessions.get(msg.sessionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "output", data: msg.data }));
      }
      break;
    }
    case "terminal_closed": {
      const ws = browserSessions.get(msg.sessionId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "closed" }));
        ws.close();
      }
      browserSessions.delete(msg.sessionId);
      break;
    }
    case "adopt_servers": {
      if (!Array.isArray(msg.servers) || msg.servers.length === 0) break;
      await adoptServers(hostId, msg.servers);
      break;
    }
    case "tunnel_data": {
      // Agent is sending bytes that came out of its local game-server
      // socket. Route them back to the corresponding public TCP client.
      deliverToExternal(msg.tunnelId, msg.connId, msg.b64);
      break;
    }
    case "tunnel_close": {
      closeExternal(msg.tunnelId, msg.connId);
      break;
    }
    case "backup_status": {
      try {
        await applyAgentBackupUpdate({
          backupId: msg.backupId,
          status: msg.status,
          path: msg.path ?? null,
          sizeBytes: msg.sizeBytes ?? null,
          error: msg.error ?? null,
        });
        if (msg.status === "success") {
          // Apply retention asynchronously: list older successful rows
          // beyond the configured count and dispatch delete_backup for
          // each. Best-effort — don't break the success report.
          applyRetentionAfterSuccess(msg.gameServerId).catch((err) =>
            console.warn(
              "[backups] retention failed:",
              (err as Error).message,
            ),
          );
        }
      } catch (err) {
        console.warn(
          "[backups] applyAgentBackupUpdate failed:",
          (err as Error).message,
        );
      }
      break;
    }
    case "backup_restore_status": {
      // The actual restart is driven by the agent; the platform just
      // logs the lifecycle. The audit row was written when the operator
      // hit "Restore" in the UI.
      console.info(
        `[backups] restore ${msg.status} for backup ${msg.backupId} on server ${msg.gameServerId}` +
          (msg.error ? ` (${msg.error})` : ""),
      );
      break;
    }
  }
}

/**
 * After a successful backup, prune older successful rows beyond the
 * configured retention count and ask the agent to delete the files.
 */
async function applyRetentionAfterSuccess(gameServerId: string): Promise<void> {
  const cfg = await getBackupConfig(gameServerId);
  const removed = await pruneSuccessfulBackups(
    gameServerId,
    cfg.retentionCount,
  );
  if (removed.length === 0) return;
  // Fan out delete_backup messages to the agent. We have to look up the
  // hostId once; all rows for the same gameServerId share it.
  const hostId = removed[0].hostId;
  for (const row of removed) {
    if (!row.path) continue;
    sendCommand(hostId, {
      type: "delete_backup",
      gameServerId,
      backupId: row.id,
      path: row.path,
    });
  }
}

/**
 * Back-populate game_servers rows from whatever the agent has on disk. Two
 * cases this handles:
 *   1. User deleted the host in the dashboard (which cascaded all its
 *      game_servers rows), reinstalled the agent, and re-enrolled. The
 *      /opt/gameserveros/servers/<uuid>/ dirs are still there. We rebuild
 *      DB rows with the same UUIDs so history is preserved.
 *   2. Fresh agent whose rows already exist and correctly reference this
 *      host — no-op.
 */
async function adoptServers(
  hostId: string,
  incoming: Array<{
    id: string;
    name: string;
    gameId: string;
    steamAppId: number | null;
    port: number;
    startupCommand: string;
  }>,
) {
  const [host] = await db
    .select({ id: hosts.id, userId: hosts.userId })
    .from(hosts)
    .where(eq(hosts.id, hostId))
    .limit(1);
  if (!host) return;

  for (const s of incoming) {
    if (!s.id || !s.name || !s.gameId || !s.port) continue;
    const [existing] = await db
      .select({ id: gameServers.id, hostId: gameServers.hostId })
      .from(gameServers)
      .where(eq(gameServers.id, s.id))
      .limit(1);

    if (!existing) {
      // Adopt: insert under this host.
      await db.insert(gameServers).values({
        id: s.id,
        hostId: host.id,
        userId: host.userId,
        name: s.name,
        gameId: s.gameId,
        status: "stopped",
        port: s.port,
        playersOnline: 0,
        maxPlayers: 0,
      });
      await db.insert(gameServerLogs).values({
        gameServerId: s.id,
        source: "system",
        level: "info",
        message:
          "Adopted existing installation from the agent. Click Start to bring it online.",
      });
      console.log(`[agent] adopted ${s.id} (${s.gameId}) under host=${hostId}`);
    } else if (existing.hostId !== host.id) {
      // Server moved to a different host (same agent bin relocated?). Retarget.
      await db
        .update(gameServers)
        .set({ hostId: host.id, userId: host.userId, updatedAt: new Date() })
        .where(eq(gameServers.id, s.id));
      console.log(`[agent] moved ${s.id} to host=${hostId}`);
    }
    // else: already correctly owned by this host — nothing to do.
  }
}

function ipFromMetrics(m: unknown): string | null {
  if (typeof m !== "object" || m === null) return null;
  const network = (m as { network?: { ip?: string } }).network;
  return network?.ip ?? null;
}

function handleTerminalConnection(ws: WebSocket) {
  const hostId = (ws as unknown as { hostId: string }).hostId;
  const userId = (ws as unknown as { userId: string }).userId;
  const sourceIp = (ws as unknown as { sourceIp: string | null }).sourceIp;
  const sessionId = createHash("sha256")
    .update(`${hostId}-${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
  browserSessions.set(sessionId, ws);

  // Audit: terminal opened. PROJECT.md §3.6 + §6.1 require timestamp,
  // source IP, user ID per session.
  recordAudit({
    hostId,
    userId,
    kind: "terminal_open",
    target: sessionId,
    sourceIp,
  }).catch(() => undefined);

  ws.on("message", (raw) => {
    let msg: { type: string; data?: string; cols?: number; rows?: number };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === "start") {
      sendCommand(hostId, { type: "open_terminal", sessionId });
    } else if (msg.type === "input" && typeof msg.data === "string") {
      sendCommand(hostId, {
        type: "terminal_input",
        sessionId,
        data: msg.data,
      });
    } else if (msg.type === "resize") {
      sendCommand(hostId, {
        type: "terminal_resize",
        sessionId,
        cols: msg.cols,
        rows: msg.rows,
      });
    }
  });

  ws.on("close", () => {
    sendCommand(hostId, { type: "close_terminal", sessionId });
    browserSessions.delete(sessionId);
    recordAudit({
      hostId,
      userId,
      kind: "terminal_close",
      target: sessionId,
      sourceIp,
    }).catch(() => undefined);
  });
}
