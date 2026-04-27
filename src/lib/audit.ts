import { and, desc, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { auditEvents, type AuditEvent } from "@/db/schema";

/**
 * Per-host audit log (PROJECT.md §3.6, §6.1).
 *
 * Every platform-issued command, terminal session lifecycle event, and
 * config change goes through here. Inserts are best-effort and never
 * thrown; an audit-write hiccup must not be allowed to break the
 * primary action.
 */

export type AuditKind =
  | "host_create"
  | "host_rename"
  | "host_delete"
  | "host_terminal_toggle"
  | "game_server_deploy"
  | "game_server_start"
  | "game_server_stop"
  | "game_server_restart"
  | "game_server_delete"
  | "terminal_open"
  | "terminal_close";

export function sourceIpFromRequest(req: NextRequest | Request): string | null {
  const h =
    "headers" in req
      ? (req as { headers: Headers }).headers
      : (req as Request).headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}

export async function recordAudit(args: {
  hostId: string;
  userId: string | null;
  kind: AuditKind;
  target?: string | null;
  details?: Record<string, unknown> | null;
  sourceIp?: string | null;
}): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      hostId: args.hostId,
      userId: args.userId,
      kind: args.kind,
      target: args.target ?? null,
      details: args.details ?? null,
      sourceIp: args.sourceIp ?? null,
    });
  } catch (err) {
    console.warn(
      `[audit] failed to record ${args.kind} for ${args.hostId}:`,
      (err as Error).message,
    );
  }
}

export async function listAuditForHost(
  hostId: string,
  limit = 100,
): Promise<AuditEvent[]> {
  return await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.hostId, hostId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);
}

// Narrow unused-import guard.
void and;
