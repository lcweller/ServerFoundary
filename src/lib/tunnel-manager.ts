import { createServer, type Server, type Socket } from "net";
import { randomBytes } from "crypto";
import { dispatchCommand } from "./agent-hub";
import {
  markTunnelConnected,
  markTunnelsTornDown,
  tunnelsForHost,
} from "./tunnels";

/**
 * In-container TCP relay — ADR 0001 Option A.
 *
 * One TCP listener per tunnel. Each inbound TCP connection gets a
 * connection id; the manager pipes bytes from the public socket to the
 * agent over the already-authenticated WebSocket (via dispatchCommand),
 * and feeds bytes back the other way when `tunnel_data` arrives from
 * the agent (see ws-server.ts:handleAgentMessage).
 *
 * Messages wire-level:
 *   platform -> agent: tunnel_open    { tunnelId, connId, internalPort }
 *                      tunnel_data    { tunnelId, connId, b64 }
 *                      tunnel_close   { tunnelId, connId }
 *   agent    -> platform: tunnel_data   { tunnelId, connId, b64 }
 *                          tunnel_close  { tunnelId, connId }
 *
 * Data frames carry base64 payloads — JSON-over-WS is uniform with the
 * rest of our agent protocol; binary WS frames can be an optimisation
 * later if profiling shows the b64 overhead matters.
 */

type Entry = {
  tunnelId: string;
  gameServerId: string;
  hostId: string;
  internalPort: number;
  server: Server;
  conns: Map<string, Socket>;
};

const byTunnelId = new Map<string, Entry>();
const byGameServerId = new Map<string, Entry>();

function genConnId(): string {
  return randomBytes(8).toString("hex");
}

export function tunnelHasConn(tunnelId: string, connId: string): boolean {
  return !!byTunnelId.get(tunnelId)?.conns.get(connId);
}

export async function beginTunnel(params: {
  tunnelId: string;
  gameServerId: string;
  hostId: string;
  externalPort: number;
  internalPort: number;
}): Promise<void> {
  const existing = byTunnelId.get(params.tunnelId);
  if (existing) {
    // Update internal port in case the agent reports a changed mapping.
    existing.internalPort = params.internalPort;
    return;
  }

  const entry: Entry = {
    tunnelId: params.tunnelId,
    gameServerId: params.gameServerId,
    hostId: params.hostId,
    internalPort: params.internalPort,
    server: createServer(),
    conns: new Map(),
  };

  entry.server.on("connection", async (socket) => {
    const connId = genConnId();
    entry.conns.set(connId, socket);

    // Flag the first successful connection in the DB so operators can
    // see "tunnel warmed up" in the UI later.
    markTunnelConnected(params.tunnelId).catch(() => undefined);

    const forwardClosed = () => {
      if (!entry.conns.delete(connId)) return;
      dispatchCommand(params.hostId, {
        type: "tunnel_close",
        tunnelId: params.tunnelId,
        connId,
      }).catch(() => undefined);
    };

    socket.on("data", (chunk) => {
      dispatchCommand(params.hostId, {
        type: "tunnel_data",
        tunnelId: params.tunnelId,
        connId,
        b64: chunk.toString("base64"),
      }).catch(() => undefined);
    });
    socket.on("end", forwardClosed);
    socket.on("close", forwardClosed);
    socket.on("error", () => undefined);

    await dispatchCommand(params.hostId, {
      type: "tunnel_open",
      tunnelId: params.tunnelId,
      connId,
      internalPort: params.internalPort,
    });
  });

  entry.server.on("error", (err) => {
    console.error(
      `[tunnel ${params.tunnelId}] listener error`,
      (err as Error).message,
    );
  });

  await new Promise<void>((resolve, reject) => {
    entry.server.once("error", reject);
    entry.server.listen(params.externalPort, "0.0.0.0", () => {
      entry.server.off("error", reject);
      console.log(
        `[tunnel] listening on :${params.externalPort} -> host=${params.hostId} internal=${params.internalPort}`,
      );
      resolve();
    });
  });

  byTunnelId.set(params.tunnelId, entry);
  byGameServerId.set(params.gameServerId, entry);
}

export async function endTunnel(
  by: { tunnelId?: string; gameServerId?: string },
): Promise<void> {
  const entry =
    (by.tunnelId && byTunnelId.get(by.tunnelId)) ||
    (by.gameServerId && byGameServerId.get(by.gameServerId)) ||
    null;
  if (!entry) return;
  byTunnelId.delete(entry.tunnelId);
  byGameServerId.delete(entry.gameServerId);
  for (const sock of entry.conns.values()) {
    try {
      sock.destroy();
    } catch {}
  }
  entry.conns.clear();
  await new Promise<void>((r) => entry.server.close(() => r()));
}

/**
 * Called from ws-server on each agent-originated tunnel_data frame. We
 * look up the socket by connId and write the decoded bytes.
 */
export function deliverToExternal(
  tunnelId: string,
  connId: string,
  b64: string,
): void {
  const entry = byTunnelId.get(tunnelId);
  const sock = entry?.conns.get(connId);
  if (!sock || sock.destroyed) return;
  try {
    sock.write(Buffer.from(b64, "base64"));
  } catch {}
}

/** Called from ws-server when the agent reports its side closed. */
export function closeExternal(tunnelId: string, connId: string): void {
  const entry = byTunnelId.get(tunnelId);
  const sock = entry?.conns.get(connId);
  if (!sock) return;
  entry!.conns.delete(connId);
  try {
    sock.end();
  } catch {}
}

/**
 * On ws-server startup, resume every tunnel we previously knew about.
 * The agent side is resynced separately (see resendTunnelsForHost).
 */
export async function resumeAllTunnels(hostIds: string[]): Promise<void> {
  for (const hostId of hostIds) {
    const rows = await tunnelsForHost(hostId);
    for (const t of rows) {
      if (t.externalPort == null) continue;
      try {
        await beginTunnel({
          tunnelId: t.id,
          gameServerId: t.gameServerId,
          hostId,
          externalPort: t.externalPort,
          internalPort: t.internalPort,
        });
      } catch (err) {
        console.warn(
          `[tunnel] could not resume tunnel ${t.id}:`,
          (err as Error).message,
        );
      }
    }
  }
}

/**
 * When an agent reconnects we drop any existing TCP state (the agent
 * side is fresh and doesn't know about in-flight connIds) and resend
 * begin_tunnel for every tunnel owned by the host's game servers.
 */
export async function resendTunnelsForHost(hostId: string): Promise<void> {
  const rows = await tunnelsForHost(hostId);
  const idsToReset: string[] = [];

  for (const t of rows) {
    if (t.externalPort == null) continue;
    idsToReset.push(t.id);

    // Tear down stale sockets for this tunnel (the agent's view is fresh).
    const entry = byTunnelId.get(t.id);
    if (entry) {
      for (const s of entry.conns.values()) {
        try {
          s.destroy();
        } catch {}
      }
      entry.conns.clear();
    } else {
      // Listener isn't up yet — bring it up now.
      try {
        await beginTunnel({
          tunnelId: t.id,
          gameServerId: t.gameServerId,
          hostId,
          externalPort: t.externalPort,
          internalPort: t.internalPort,
        });
      } catch (err) {
        console.warn(
          `[tunnel] resume on reconnect failed for ${t.id}:`,
          (err as Error).message,
        );
        continue;
      }
    }

    await dispatchCommand(hostId, {
      type: "begin_tunnel",
      tunnel: {
        id: t.id,
        gameServerId: t.gameServerId,
        internalPort: t.internalPort,
      },
    });
  }

  if (idsToReset.length > 0) {
    markTunnelsTornDown(idsToReset).catch(() => undefined);
  }
}
