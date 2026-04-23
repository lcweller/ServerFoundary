"use client";

import Link from "next/link";
import type { Host } from "@/db/schema";
import type { Metrics } from "@/lib/hosts";
import { HxCard } from "@/components/hex/card";
import { HxBadge } from "@/components/hex/badge";
import { StatusDot } from "@/components/hex/status-dot";
import { Sparkline } from "@/components/hex/sparkline";
import { useRollingSeries } from "@/components/hex/use-rolling-series";
import { uptimeLabel } from "@/lib/format";

type Row = Host & {
  effectiveStatus: "online" | "offline" | "connecting";
  metrics: Metrics | null;
  serverCount: number;
};

export function HostsList({ hosts }: { hosts: Row[] }) {
  return (
    <div
      className="grid gap-[var(--hx-gap-md)]"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
    >
      {hosts.map((h) => (
        <HostTile key={h.id} host={h} />
      ))}
    </div>
  );
}

function HostTile({ host }: { host: Row }) {
  const cpu = host.metrics?.cpu?.usage ?? null;
  const memTotal = host.metrics?.memory?.total_gb ?? 0;
  const memUsed = host.metrics?.memory?.used_gb ?? 0;
  const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : null;
  const series = useRollingSeries(cpu, 30);
  const statusColor =
    host.effectiveStatus === "online"
      ? "var(--hx-accent)"
      : host.effectiveStatus === "connecting"
        ? "var(--hx-warn)"
        : "var(--hx-muted-fg)";

  return (
    <Link
      href={`/dashboard/hosts/${host.id}`}
      className="block text-left transition-colors hover:border-[var(--hx-border-strong)]"
    >
      <HxCard
        padding={16}
        className="flex h-full flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <StatusDot status={host.effectiveStatus} size={7} />
          <div className="truncate font-mono text-[13px] font-medium">
            {host.name}
          </div>
          <div className="flex-1" />
          <HxBadge
            tone={
              host.effectiveStatus === "online"
                ? "ok"
                : host.effectiveStatus === "connecting"
                  ? "warn"
                  : "neutral"
            }
            size="sm"
          >
            {host.effectiveStatus}
          </HxBadge>
        </div>
        <div className="truncate text-[11.5px] text-[var(--hx-muted-fg)]">
          {host.ipAddress ?? "awaiting heartbeat"} ·{" "}
          {host.metrics?.cpu?.cores ? `${host.metrics.cpu.cores}c` : "—"} /{" "}
          {memTotal > 0 ? `${memTotal.toFixed(0)} GB` : "—"} ·{" "}
          {host.serverCount} {host.serverCount === 1 ? "server" : "servers"}
        </div>
        <Sparkline data={series} width={240} height={40} color={statusColor} />
        <div className="flex items-center gap-3.5 font-mono text-[11.5px] text-[var(--hx-muted-fg)]">
          <span>
            CPU{" "}
            <span className="text-[var(--hx-fg)]">
              {cpu != null ? `${cpu.toFixed(0)}%` : "—"}
            </span>
          </span>
          <span>
            MEM{" "}
            <span className="text-[var(--hx-fg)]">
              {memPct != null ? `${memPct.toFixed(0)}%` : "—"}
            </span>
          </span>
          <span className="flex-1" />
          <span>
            {host.metrics?.uptime_seconds
              ? `↑ ${uptimeLabel(host.metrics.uptime_seconds)}`
              : "—"}
          </span>
        </div>
      </HxCard>
    </Link>
  );
}
