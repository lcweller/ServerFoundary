import { EventEmitter } from "events";

/**
 * In-memory registry of live agent WebSocket connections, keyed by hostId.
 * This only holds entries in the PROCESS that accepted the WS — i.e., the
 * ws-server. The Next.js process has its own (empty) copy. That's why
 * command dispatch from API routes has to go over HTTP to the ws-server
 * (see dispatchCommand / handleInternalDispatch below).
 */

type Sender = (msg: unknown) => boolean;

const senders = new Map<string, Sender>();
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function registerAgent(hostId: string, sender: Sender) {
  senders.set(hostId, sender);
  bus.emit("connected", hostId);
}

export function unregisterAgent(hostId: string) {
  senders.delete(hostId);
  bus.emit("disconnected", hostId);
}

/** Direct send (only works in the ws-server process where the agent map lives). */
export function sendCommand(hostId: string, command: unknown): boolean {
  const send = senders.get(hostId);
  if (!send) return false;
  try {
    return send(command);
  } catch {
    return false;
  }
}

export function isAgentConnectedLocal(hostId: string): boolean {
  return senders.has(hostId);
}

export function onAgentMessage(handler: (hostId: string, msg: unknown) => void) {
  bus.on("message", handler);
  return () => bus.off("message", handler);
}

export function emitAgentMessage(hostId: string, msg: unknown) {
  bus.emit("message", hostId, msg);
}

export function onAgentStatus(handler: (hostId: string, connected: boolean) => void) {
  const onConnected = (id: string) => handler(id, true);
  const onDisconnected = (id: string) => handler(id, false);
  bus.on("connected", onConnected);
  bus.on("disconnected", onDisconnected);
  return () => {
    bus.off("connected", onConnected);
    bus.off("disconnected", onDisconnected);
  };
}

/**
 * Cross-process command dispatch. The Next.js process calls this; it POSTs
 * to the ws-server's /internal/dispatch, which holds the actual agent
 * connections in memory. Protected by a shared secret passed via the
 * INTERNAL_API_KEY env var (both processes see it because the container
 * entrypoint exports it before starting either).
 */
export async function dispatchCommand(
  hostId: string,
  command: unknown,
): Promise<boolean> {
  const internalUrl =
    process.env.INTERNAL_WS_URL ?? `http://127.0.0.1:${process.env.AGENT_WS_PORT ?? "3001"}`;
  const key = process.env.INTERNAL_API_KEY ?? "";
  if (!key) {
    // Missing configuration. Fall back to local (dev mode, single process).
    return sendCommand(hostId, command);
  }
  try {
    const res = await fetch(`${internalUrl}/internal/dispatch`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ hostId, command }),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({ delivered: false }))) as {
      delivered?: boolean;
    };
    return data.delivered === true;
  } catch {
    return false;
  }
}

