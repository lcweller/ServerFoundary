/**
 * In-app notifications (PROJECT.md §3.11).
 *
 * Inserts are best-effort and never thrown — a notification-write hiccup
 * must not be allowed to break the primary action that triggered it.
 *
 * Email delivery is deferred to a later phase; see CLAUDE.md "Known stack
 * divergences". When that lands, this module will sprout an email
 * dispatch fork inside `notify()`.
 */

import { and, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  hosts,
  gameServers,
  notifications,
  type Notification,
} from "@/db/schema";

export type NotificationKind =
  | "host_online"
  | "host_offline"
  | "host_paired"
  | "agent_update_success"
  | "agent_update_failed"
  | "game_server_started"
  | "game_server_crashed"
  | "game_server_updated"
  | "game_server_update_failed"
  | "backup_completed"
  | "backup_failed"
  | "memory_threshold"
  | "disk_threshold"
  | "auth_failure";

export type NotificationSeverity = "info" | "warn" | "err";

export async function notify(args: {
  userId: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body?: string | null;
  hostId?: string | null;
  gameServerId?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId: args.userId,
      kind: args.kind,
      severity: args.severity,
      title: args.title,
      body: args.body ?? null,
      hostId: args.hostId ?? null,
      gameServerId: args.gameServerId ?? null,
      details: args.details ?? null,
    });
  } catch (err) {
    console.warn(
      `[notify] failed to insert ${args.kind} for user ${args.userId}:`,
      (err as Error).message,
    );
  }
}

/**
 * Resolve the owning user for a host, used by the ws-server to route
 * notifications produced by agent traffic. Returns null if the host has
 * been deleted or never existed.
 */
export async function userIdForHost(
  hostId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: hosts.userId })
    .from(hosts)
    .where(eq(hosts.id, hostId))
    .limit(1);
  return row?.userId ?? null;
}

export async function userIdForGameServer(
  gameServerId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: gameServers.userId })
    .from(gameServers)
    .where(eq(gameServers.id, gameServerId))
    .limit(1);
  return row?.userId ?? null;
}

export async function listNotifications(
  userId: string,
  opts: { includeDismissed?: boolean; limit?: number } = {},
): Promise<Notification[]> {
  const limit = opts.limit ?? 50;
  if (opts.includeDismissed) {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }
  return await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.dismissedAt),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.dismissedAt),
      ),
    );
  return row?.n ?? 0;
}

export async function markRead(
  userId: string,
  id: string,
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, userId)),
    );
}

export async function markAllRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
}

export async function dismiss(userId: string, id: string): Promise<void> {
  const now = new Date();
  await db
    .update(notifications)
    .set({ dismissedAt: now, readAt: now })
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, userId)),
    );
}

export async function dismissAll(userId: string): Promise<void> {
  const now = new Date();
  await db
    .update(notifications)
    .set({ dismissedAt: now, readAt: now })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.dismissedAt),
      ),
    );
}
