import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { tunnels, gameServers, type Tunnel } from "@/db/schema";

/**
 * Allocation pool for the external TCP port range the platform exposes
 * through the in-container relay (ADR 0001 Option A).
 *
 * Set via env so the operator can widen the range if needed. Keep the
 * default conservative (100 slots) — matches the Unraid template.
 */
export const EXTERNAL_PORT_START = Number(
  process.env.EXTERNAL_PORT_START ?? 30000,
);
export const EXTERNAL_PORT_COUNT = Number(
  process.env.EXTERNAL_PORT_COUNT ?? 100,
);
export const EXTERNAL_PORT_END = EXTERNAL_PORT_START + EXTERNAL_PORT_COUNT - 1;

export function externalHostname(): string {
  // Prefer an explicit relay hostname, then fall back to the dashboard
  // URL's hostname (the relay runs in the same container/process today).
  const explicit = process.env.RELAY_PUBLIC_HOSTNAME;
  if (explicit) return explicit;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  try {
    const u = new URL(appUrl);
    return u.hostname;
  } catch {
    return "localhost";
  }
}

/**
 * Atomically allocate a free port from the pool and create a pending
 * tunnel row for the given game server.
 *
 * The naive approach (select-then-insert) is racy, so we loop: pick the
 * lowest unused port, try an insert guarded by a conflict check. If a
 * concurrent allocator grabbed the same port, loop and try the next.
 */
export async function allocateTunnel(gameServerId: string): Promise<Tunnel> {
  const hostname = externalHostname();

  // Is there already a tunnel row for this server? If so just return it
  // — deploy is idempotent.
  const [existing] = await db
    .select()
    .from(tunnels)
    .where(eq(tunnels.gameServerId, gameServerId))
    .limit(1);
  if (existing) return existing;

  // Read all currently-allocated ports and pick the lowest unused one.
  // The set size is bounded by EXTERNAL_PORT_COUNT so this is cheap even
  // as we scale (capped at ~100 rows).
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await db
      .select({ port: tunnels.externalPort })
      .from(tunnels)
      .where(isNotNull(tunnels.externalPort));
    const used = new Set(taken.map((t) => t.port).filter((p): p is number => p != null));
    let picked: number | null = null;
    for (let p = EXTERNAL_PORT_START; p <= EXTERNAL_PORT_END; p++) {
      if (!used.has(p)) {
        picked = p;
        break;
      }
    }
    if (picked == null) {
      throw new Error(
        `No free external port in [${EXTERNAL_PORT_START}, ${EXTERNAL_PORT_END}]. ` +
          `Raise EXTERNAL_PORT_COUNT.`,
      );
    }
    try {
      const [row] = await db
        .insert(tunnels)
        .values({
          gameServerId,
          provider: "inproc_tcp_relay",
          externalHostname: hostname,
          externalPort: picked,
          status: "pending",
        })
        .returning();
      return row;
    } catch {
      // Unique-constraint race on gameServerId or port — retry.
      continue;
    }
  }
  throw new Error("Could not allocate a tunnel after 5 attempts.");
}

export async function releaseTunnel(gameServerId: string): Promise<void> {
  await db.delete(tunnels).where(eq(tunnels.gameServerId, gameServerId));
}

/**
 * All active tunnels for a given host — used on agent reconnect to
 * re-issue `begin_tunnel` commands so the multiplexer and agent come
 * back into sync.
 */
export async function tunnelsForHost(hostId: string): Promise<
  Array<Tunnel & { internalPort: number; userId: string }>
> {
  const rows = await db
    .select({
      tunnel: tunnels,
      internalPort: gameServers.port,
      userId: gameServers.userId,
    })
    .from(tunnels)
    .innerJoin(gameServers, eq(tunnels.gameServerId, gameServers.id))
    .where(eq(gameServers.hostId, hostId));
  return rows.map((r) => ({
    ...r.tunnel,
    internalPort: r.internalPort,
    userId: r.userId,
  }));
}

/** Mark a tunnel "connected" on first successful client passthrough. */
export async function markTunnelConnected(tunnelId: string): Promise<void> {
  await db
    .update(tunnels)
    .set({ status: "connected", lastConnectedAt: new Date() })
    .where(eq(tunnels.id, tunnelId));
}

/** Convenience: mark a set of tunnels as torn down (e.g., on process exit). */
export async function markTunnelsTornDown(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.update(tunnels).set({ status: "pending" }).where(inArray(tunnels.id, ids));
}

// Narrow unused-warning guard.
void and;
