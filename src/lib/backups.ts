/**
 * Backup orchestration (PROJECT.md §3.10).
 *
 * The Next.js side owns the database state — `backups` and `backup_configs`
 * — and the ws-server actually issues commands to agents. This module is
 * the shared kernel both processes import:
 *
 *   - `createPendingBackup` allocates a row before dispatch so the agent
 *     reports back against a known id.
 *   - `applyAgentBackupUpdate` reconciles the row when the agent reports
 *     progress, success, or failure.
 *   - `pruneOldBackups` enforces "keep last N successful" retention.
 *   - `runBackupSchedulerTick` walks `backup_configs.enabled=true` rows
 *     whose `last_run_at` is older than `every_hours` and dispatches a
 *     scheduled backup. Idempotent if called concurrently — the
 *     `last_run_at` write is the lock.
 *
 * Backup files live on the host's own disk under
 * `<SERVERS_DIR>/<gameServerId>/.gameserveros-backups/<backupId>.tar.gz`.
 * Cloudflare R2 / S3 destinations are deferred — see CLAUDE.md.
 */

import { and, asc, desc, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  backups,
  backupConfigs,
  gameServers,
  type Backup,
  type BackupConfig,
} from "@/db/schema";
import { dispatchCommand } from "@/lib/agent-hub";

export type BackupStatus = "pending" | "running" | "success" | "failed";

export async function createPendingBackup(args: {
  gameServerId: string;
  hostId: string;
  userId: string | null;
  trigger: "manual" | "scheduled";
}): Promise<Backup> {
  const [row] = await db
    .insert(backups)
    .values({
      gameServerId: args.gameServerId,
      hostId: args.hostId,
      userId: args.userId,
      trigger: args.trigger,
      destination: "local",
      status: "pending",
    })
    .returning();
  return row;
}

export async function listBackupsForServer(
  gameServerId: string,
): Promise<Backup[]> {
  return await db
    .select()
    .from(backups)
    .where(eq(backups.gameServerId, gameServerId))
    .orderBy(desc(backups.startedAt))
    .limit(100);
}

export async function getBackup(id: string): Promise<Backup | null> {
  const [row] = await db
    .select()
    .from(backups)
    .where(eq(backups.id, id))
    .limit(1);
  return row ?? null;
}

export async function applyAgentBackupUpdate(args: {
  backupId: string;
  status: BackupStatus;
  path?: string | null;
  sizeBytes?: number | null;
  error?: string | null;
}): Promise<Backup | null> {
  const patch: Partial<Backup> = { status: args.status };
  if (args.path !== undefined) patch.path = args.path;
  if (args.sizeBytes !== undefined) patch.sizeBytes = args.sizeBytes;
  if (args.error !== undefined) patch.error = args.error;
  if (args.status === "success" || args.status === "failed") {
    patch.completedAt = new Date();
  }
  const [row] = await db
    .update(backups)
    .set(patch)
    .where(eq(backups.id, args.backupId))
    .returning();
  return row ?? null;
}

/**
 * Mark a backup `failed` with the given message. Used when dispatch to the
 * agent itself fails (host offline) so the row doesn't get stuck in
 * `pending` forever.
 */
export async function markBackupFailed(
  backupId: string,
  error: string,
): Promise<void> {
  await db
    .update(backups)
    .set({ status: "failed", error, completedAt: new Date() })
    .where(eq(backups.id, backupId));
}

/**
 * Keep last N *successful* backups, plus all in-flight rows. Returns the
 * deleted rows so the caller can dispatch `delete_backup` for each path.
 */
export async function pruneSuccessfulBackups(
  gameServerId: string,
  keep: number,
): Promise<Backup[]> {
  if (keep < 1) keep = 1;
  const successful = await db
    .select()
    .from(backups)
    .where(
      and(
        eq(backups.gameServerId, gameServerId),
        eq(backups.status, "success"),
      ),
    )
    .orderBy(desc(backups.startedAt));
  const toDelete = successful.slice(keep);
  if (toDelete.length === 0) return [];
  await db
    .delete(backups)
    .where(
      sql`${backups.id} = ANY(${toDelete.map((b) => b.id)})`,
    );
  return toDelete;
}

export async function deleteBackupRow(id: string): Promise<Backup | null> {
  const [row] = await db
    .delete(backups)
    .where(eq(backups.id, id))
    .returning();
  return row ?? null;
}

// ---- Backup config ---------------------------------------------------------

export async function getBackupConfig(
  gameServerId: string,
): Promise<BackupConfig> {
  const [row] = await db
    .select()
    .from(backupConfigs)
    .where(eq(backupConfigs.gameServerId, gameServerId))
    .limit(1);
  if (row) return row;
  const [inserted] = await db
    .insert(backupConfigs)
    .values({ gameServerId })
    .returning();
  return inserted;
}

export async function setBackupConfig(
  gameServerId: string,
  patch: { enabled?: boolean; everyHours?: number; retentionCount?: number },
): Promise<BackupConfig> {
  const next: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.everyHours !== undefined) {
    next.everyHours = clamp(patch.everyHours, 1, 24 * 7);
  }
  if (patch.retentionCount !== undefined) {
    next.retentionCount = clamp(patch.retentionCount, 1, 365);
  }
  // Make sure a row exists, then update.
  await db
    .insert(backupConfigs)
    .values({ gameServerId, ...patch })
    .onConflictDoUpdate({
      target: backupConfigs.gameServerId,
      set: next,
    });
  const [row] = await db
    .select()
    .from(backupConfigs)
    .where(eq(backupConfigs.gameServerId, gameServerId))
    .limit(1);
  return row;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

// ---- Scheduler -------------------------------------------------------------

/**
 * Pick scheduled backups due to run, mark `last_run_at = now()` (so two
 * concurrent ticks don't both fire), and dispatch the command. Caller is
 * the ws-server boot loop in `startBackupScheduler`.
 *
 * Returns the count of backups dispatched (for logging).
 */
export async function runBackupSchedulerTick(): Promise<number> {
  const now = new Date();
  // Read first; we need every_hours to compute the threshold per row.
  const due = await db
    .select({
      cfg: backupConfigs,
      gs: gameServers,
    })
    .from(backupConfigs)
    .innerJoin(
      gameServers,
      eq(gameServers.id, backupConfigs.gameServerId),
    )
    .where(
      and(
        eq(backupConfigs.enabled, true),
        or(
          // Never run before, OR last run + every_hours <= now.
          sql`${backupConfigs.lastRunAt} IS NULL`,
          sql`${backupConfigs.lastRunAt} + (${backupConfigs.everyHours} * interval '1 hour') <= ${now}`,
        ),
      ),
    );

  let dispatched = 0;
  for (const { cfg, gs } of due) {
    // Tighten the lock first: only one process should win the race.
    const claim = await db
      .update(backupConfigs)
      .set({ lastRunAt: now, updatedAt: now })
      .where(
        and(
          eq(backupConfigs.gameServerId, cfg.gameServerId),
          // Re-check the predicate inside the UPDATE so we don't
          // double-fire if two ticks raced past the SELECT.
          or(
            sql`${backupConfigs.lastRunAt} IS NULL`,
            sql`${backupConfigs.lastRunAt} + (${backupConfigs.everyHours} * interval '1 hour') <= ${now}`,
          ),
        ),
      )
      .returning({ id: backupConfigs.gameServerId });
    if (claim.length === 0) continue;

    const row = await createPendingBackup({
      gameServerId: gs.id,
      hostId: gs.hostId,
      userId: null,
      trigger: "scheduled",
    });
    const ok = await dispatchCommand(gs.hostId, {
      type: "backup_game_server",
      gameServerId: gs.id,
      backupId: row.id,
    });
    if (!ok) {
      await markBackupFailed(row.id, "Host offline at scheduled time");
      continue;
    }
    dispatched++;
  }
  return dispatched;
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

/** Idempotent. Runs a tick every minute on the calling process. */
export function startBackupScheduler(): void {
  if (schedulerTimer) return;
  const tick = () => {
    runBackupSchedulerTick().catch((err) => {
      console.warn("[backups] scheduler tick failed:", (err as Error).message);
    });
  };
  // Run shortly after boot so missed runs catch up; then on a 60s cadence.
  setTimeout(tick, 5_000);
  schedulerTimer = setInterval(tick, 60_000);
}

// Avoid unused-import errors for symbols kept around for future filters.
void asc;
void isNotNull;
void lt;
