import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  hostMetricsHourly,
  hostMetricsMinutely,
} from "@/db/schema";
import type { Metrics } from "@/lib/hosts";

/**
 * Per-host metrics time-series aggregator.
 *
 * Called from the ws-server on every agent heartbeat (every ~10 s). Two
 * levels of resolution:
 *
 *   minutely  — retained ~3 days; drives the "last hour" chart
 *   hourly    — retained 30 days; drives the 24h / 7d / 30d charts
 *
 * We UPSERT against (host_id, bucket) with SQL expressions that sum new
 * samples into the existing row. Avg is derived as sum / samples at
 * read time. No client-side rolling-mean arithmetic needed.
 *
 * Call is best-effort: the heartbeat handler fires this and continues.
 * A DB hiccup shouldn't lose the host's live-metrics update.
 */

type Sample = {
  cpuUsage: number | null;
  memPct: number | null;
  diskUsedGb: number | null;
  cpuTemp: number | null;
};

function extractSample(m: Metrics | Record<string, unknown> | null): Sample | null {
  if (!m || typeof m !== "object") return null;
  const cpu = (m as Metrics).cpu;
  const memory = (m as Metrics).memory;
  const disk = (m as Metrics).disk;
  const cpuUsage = typeof cpu?.usage === "number" ? cpu.usage : null;
  const cpuTemp = typeof cpu?.temp === "number" ? cpu.temp : null;
  const memPct =
    memory && typeof memory.total_gb === "number" && memory.total_gb > 0
      ? ((memory.used_gb ?? 0) / memory.total_gb) * 100
      : null;
  const diskUsedGb =
    disk && typeof disk.used_gb === "number" ? disk.used_gb : null;
  if (cpuUsage == null && memPct == null && diskUsedGb == null) {
    return null;
  }
  return {
    cpuUsage: cpuUsage ?? 0,
    memPct: memPct ?? 0,
    diskUsedGb,
    cpuTemp,
  };
}

function truncateMinute(d: Date): Date {
  const out = new Date(d);
  out.setUTCSeconds(0, 0);
  return out;
}

function truncateHour(d: Date): Date {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

/**
 * Write a heartbeat sample into both aggregate tables. Silently ignores
 * heartbeats without usable CPU/memory/disk numbers (e.g., first
 * heartbeat before the agent's CPU delta has computed).
 */
export async function recordHeartbeat(
  hostId: string,
  metrics: unknown,
  at: Date = new Date(),
): Promise<void> {
  const sample = extractSample(metrics as Metrics | null);
  if (!sample) return;

  const base = {
    samples: 1,
    cpuSum: sample.cpuUsage ?? 0,
    cpuMax: sample.cpuUsage ?? 0,
    memPctSum: sample.memPct ?? 0,
    memPctMax: sample.memPct ?? 0,
    diskUsedGb: sample.diskUsedGb,
    cpuTempMax: sample.cpuTemp,
  };

  // Minutely
  await db
    .insert(hostMetricsMinutely)
    .values({ hostId, bucket: truncateMinute(at), ...base })
    .onConflictDoUpdate({
      target: [hostMetricsMinutely.hostId, hostMetricsMinutely.bucket],
      set: {
        samples: sql`${hostMetricsMinutely.samples} + 1`,
        cpuSum: sql`${hostMetricsMinutely.cpuSum} + ${base.cpuSum}`,
        cpuMax: sql`GREATEST(${hostMetricsMinutely.cpuMax}, ${base.cpuMax})`,
        memPctSum: sql`${hostMetricsMinutely.memPctSum} + ${base.memPctSum}`,
        memPctMax: sql`GREATEST(${hostMetricsMinutely.memPctMax}, ${base.memPctMax})`,
        diskUsedGb: sql`COALESCE(${base.diskUsedGb}, ${hostMetricsMinutely.diskUsedGb})`,
        cpuTempMax: sql`GREATEST(COALESCE(${hostMetricsMinutely.cpuTempMax}, 0), COALESCE(${base.cpuTempMax}, 0))`,
      },
    });

  // Hourly
  await db
    .insert(hostMetricsHourly)
    .values({ hostId, bucket: truncateHour(at), ...base })
    .onConflictDoUpdate({
      target: [hostMetricsHourly.hostId, hostMetricsHourly.bucket],
      set: {
        samples: sql`${hostMetricsHourly.samples} + 1`,
        cpuSum: sql`${hostMetricsHourly.cpuSum} + ${base.cpuSum}`,
        cpuMax: sql`GREATEST(${hostMetricsHourly.cpuMax}, ${base.cpuMax})`,
        memPctSum: sql`${hostMetricsHourly.memPctSum} + ${base.memPctSum}`,
        memPctMax: sql`GREATEST(${hostMetricsHourly.memPctMax}, ${base.memPctMax})`,
        diskUsedGb: sql`COALESCE(${base.diskUsedGb}, ${hostMetricsHourly.diskUsedGb})`,
        cpuTempMax: sql`GREATEST(COALESCE(${hostMetricsHourly.cpuTempMax}, 0), COALESCE(${base.cpuTempMax}, 0))`,
      },
    });
}

// --- Read API -----------------------------------------------------------

export type MetricsRange = "1h" | "24h" | "7d" | "30d";

export type MetricsPoint = {
  bucket: string;
  cpuAvg: number;
  cpuMax: number;
  memPctAvg: number;
  memPctMax: number;
  diskUsedGb: number | null;
  cpuTempMax: number | null;
};

export async function readMetrics(
  hostId: string,
  range: MetricsRange,
): Promise<MetricsPoint[]> {
  const now = new Date();
  const table = range === "1h" ? hostMetricsMinutely : hostMetricsHourly;
  const since = new Date(now);
  switch (range) {
    case "1h":
      since.setHours(since.getHours() - 1);
      break;
    case "24h":
      since.setHours(since.getHours() - 24);
      break;
    case "7d":
      since.setDate(since.getDate() - 7);
      break;
    case "30d":
      since.setDate(since.getDate() - 30);
      break;
  }
  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.hostId, hostId), gte(table.bucket, since)))
    .orderBy(asc(table.bucket));

  return rows.map((r) => ({
    bucket: r.bucket.toISOString(),
    cpuAvg: r.samples > 0 ? r.cpuSum / r.samples : 0,
    cpuMax: r.cpuMax,
    memPctAvg: r.samples > 0 ? r.memPctSum / r.samples : 0,
    memPctMax: r.memPctMax,
    diskUsedGb: r.diskUsedGb,
    cpuTempMax: r.cpuTempMax,
  }));
}

// --- Retention ----------------------------------------------------------

export async function pruneOldMetrics(): Promise<{
  minutelyDeleted: number;
  hourlyDeleted: number;
}> {
  const now = new Date();
  const minuteCutoff = new Date(now);
  minuteCutoff.setDate(minuteCutoff.getDate() - 3);
  const hourCutoff = new Date(now);
  hourCutoff.setDate(hourCutoff.getDate() - 30);

  const mRes = await db
    .delete(hostMetricsMinutely)
    .where(lt(hostMetricsMinutely.bucket, minuteCutoff))
    .returning({ id: hostMetricsMinutely.hostId });
  const hRes = await db
    .delete(hostMetricsHourly)
    .where(lt(hostMetricsHourly.bucket, hourCutoff))
    .returning({ id: hostMetricsHourly.hostId });
  return {
    minutelyDeleted: mRes.length,
    hourlyDeleted: hRes.length,
  };
}
