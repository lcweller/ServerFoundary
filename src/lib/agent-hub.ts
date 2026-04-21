import { EventEmitter } from "events";

/**
 * In-memory registry of live agent WebSocket connections, keyed by hostId.
 * The WS server process (server.mjs) is the same Node.js process as Next.js
 * when run via `next start` plus our custom launcher. We expose simple send /
 * listen helpers so API routes and dashboard-side WebSockets can forward
 * commands to agents and receive events back.
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

export function sendCommand(hostId: string, command: unknown): boolean {
  const send = senders.get(hostId);
  if (!send) return false;
  try {
    return send(command);
  } catch {
    return false;
  }
}

export function isAgentConnected(hostId: string): boolean {
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
