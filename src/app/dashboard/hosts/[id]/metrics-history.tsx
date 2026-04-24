"use client";

import { useCallback, useEffect, useState } from "react";
import { HxCard } from "@/components/hex/card";
import { Sparkline } from "@/components/hex/sparkline";

type Range = "1h" | "24h" | "7d" | "30d";

type Point = {
  bucket: string;
  cpuAvg: number;
  cpuMax: number;
  memPctAvg: number;
  memPctMax: number;
  diskUsedGb: number | null;
  cpuTempMax: number | null;
};

const RANGES: { id: Range; label: string }[] = [
  { id: "1h", label: "1h" },
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
];

/**
 * Two stacked BigCharts — CPU and Memory — sourced from the aggregated
 * host_metrics tables. See PROJECT.md §3.3 / §11 step 7. Points start
 * appearing as soon as the first heartbeat lands; the 24h / 7d / 30d
 * views only populate with history the longer the host stays online,
 * which is honest rather than fabricated.
 */
export function MetricsHistory({ hostId }: { hostId: string }) {
  const [range, setRange] = useState<Range>("1h");
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hosts/${hostId}/metrics?range=${range}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { points: Point[] };
        setPoints(data.points ?? []);
      }
    } catch {
      // swallow — next tick retries
    }
    setLoading(false);
  }, [hostId, range]);

  useEffect(() => {
    load();
    // Refresh every 30s at 1h; less often for wider windows.
    const interval = range === "1h" ? 15_000 : 60_000;
    const t = setInterval(load, interval);
    return () => clearInterval(t);
  }, [load, range]);

  const cpuAvg = points.map((p) => p.cpuAvg);
  const cpuMax = points.map((p) => p.cpuMax);
  const memAvg = points.map((p) => p.memPctAvg);
  const memMax = points.map((p) => p.memPctMax);

  const currentCpu = cpuAvg[cpuAvg.length - 1];
  const currentMem = memAvg[memAvg.length - 1];

  return (
    <HxCard padding={0}>
      <div
        className="flex items-center justify-between border-b px-[18px] py-[14px]"
        style={{ borderColor: "var(--hx-border)" }}
      >
        <div className="text-[13.5px] font-medium">History</div>
        <div
          className="inline-flex overflow-hidden rounded-md border"
          style={{ borderColor: "var(--hx-border)" }}
        >
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className="px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide"
              style={{
                background:
                  range === r.id ? "var(--hx-chip)" : "transparent",
                color:
                  range === r.id ? "var(--hx-fg)" : "var(--hx-muted-fg)",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="grid gap-[var(--hx-gap-md)] p-[18px]"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <HistoryPanel
          title="CPU"
          unit="%"
          avgLatest={currentCpu}
          avgSeries={cpuAvg}
          maxSeries={cpuMax}
          color="var(--hx-accent)"
          empty={points.length === 0}
          loading={loading}
        />
        <HistoryPanel
          title="Memory"
          unit="%"
          avgLatest={currentMem}
          avgSeries={memAvg}
          maxSeries={memMax}
          color="var(--hx-accent-2)"
          empty={points.length === 0}
          loading={loading}
        />
      </div>

      <div
        className="flex items-center justify-between border-t px-[18px] py-2 font-mono text-[11px] text-[var(--hx-muted-fg)]"
        style={{ borderColor: "var(--hx-border)" }}
      >
        <span>
          {points.length === 0
            ? "no samples yet"
            : `${points.length} ${points.length === 1 ? "point" : "points"}`}
        </span>
        <span>
          {range === "1h"
            ? "minute granularity"
            : "hour granularity · 30 day retention"}
        </span>
      </div>
    </HxCard>
  );
}

function HistoryPanel({
  title,
  unit,
  avgLatest,
  avgSeries,
  maxSeries,
  color,
  empty,
  loading,
}: {
  title: string;
  unit: string;
  avgLatest: number | undefined;
  avgSeries: number[];
  maxSeries: number[];
  color: string;
  empty: boolean;
  loading: boolean;
}) {
  const maxLatest = maxSeries[maxSeries.length - 1];
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="hx-mono-tag text-[var(--hx-muted-fg)]">{title}</div>
          <div
            className="mt-1 text-[24px] font-medium"
            style={{ letterSpacing: "-0.02em" }}
          >
            {avgLatest != null ? `${avgLatest.toFixed(0)}${unit}` : "—"}
          </div>
        </div>
        <div className="text-right font-mono text-[11px] text-[var(--hx-muted-fg)]">
          peak {maxLatest != null ? `${maxLatest.toFixed(0)}${unit}` : "—"}
        </div>
      </div>
      <div className="mt-3 h-[120px]">
        {empty ? (
          <div
            className="flex h-full items-center justify-center rounded-md border text-[12px] text-[var(--hx-muted-fg)]"
            style={{
              borderStyle: "dashed",
              borderColor: "var(--hx-border)",
            }}
          >
            {loading ? "Loading…" : "No data yet — samples appear as the agent heartbeats"}
          </div>
        ) : (
          <Sparkline data={avgSeries} width={320} height={120} color={color} />
        )}
      </div>
    </div>
  );
}
