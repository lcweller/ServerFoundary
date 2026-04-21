import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hosts, type Host } from "@/db/schema";

export const HEARTBEAT_STALE_MS = 30_000;

export type Metrics = {
  cpu?: { model?: string; cores?: number; usage?: number; temp?: number | null };
  memory?: { total_gb?: number; used_gb?: number };
  disk?: { total_gb?: number; used_gb?: number; path?: string };
  network?: { ip?: string; interfaces?: unknown };
  os?: { name?: string; version?: string; kernel?: string };
  uptime_seconds?: number;
};

export function computeStatus(host: Host): "online" | "offline" | "connecting" {
  if (!host.lastHeartbeatAt) {
    return host.status === "connecting" ? "connecting" : "offline";
  }
  const age = Date.now() - host.lastHeartbeatAt.getTime();
  return age <= HEARTBEAT_STALE_MS ? "online" : "offline";
}

export async function getUserHost(
  userId: string,
  hostId: string,
): Promise<Host | null> {
  const [row] = await db
    .select()
    .from(hosts)
    .where(and(eq(hosts.id, hostId), eq(hosts.userId, userId)))
    .limit(1);
  return row ?? null;
}
