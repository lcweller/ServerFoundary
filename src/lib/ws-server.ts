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
          .select({ id: hosts.id, userId: hosts.userId })
          .from(hosts)
          .where(eq(hosts.id, hostId))
          .limit(1);
        if (!host || host.userId !== row.userId) {
          socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
          socket.destroy();
          return;
        }
        terminalWss!.handleUpgrade(req, socket, head, (ws) => {
          (ws as unknown as { hostId: string; userId: string }).hostId = hostId;
          (ws as unknown as { userId: string }).userId = row.userId;
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
  const sessionId = createHash("sha256")
    .update(`${hostId}-${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 16);
  browserSessions.set(sessionId, ws);

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
  });
}
