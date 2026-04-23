"use client";

import type { Host } from "@/db/schema";
import type { Metrics } from "@/lib/hosts";
import { HxCard } from "@/components/hex/card";
import { Sparkline } from "@/components/hex/sparkline";
import { HxIcon, type HxIconName } from "@/components/hex/icons";
import { useRollingSeries } from "@/components/hex/use-rolling-series";
import { uptimeLabel } from "@/lib/format";

export function OverviewTab({ host }: { host: Host }) {
  const m = (host.metrics as Metrics | null) ?? null;
  const cpu = m?.cpu?.usage ?? null;
  const memPct =
    m?.memory?.total_gb && m.memory.total_gb > 0
      ? ((m.memory.used_gb ?? 0) / m.memory.total_gb) * 100
      : null;
  const diskPct =
    m?.disk?.total_gb && m.disk.total_gb > 0
      ? ((m.disk.used_gb ?? 0) / m.disk.total_gb) * 100
      : null;
  const tempC = m?.cpu?.temp ?? null;

  const cpuSeries = useRollingSeries(cpu, 60);
  const memSeries = useRollingSeries(memPct, 60);
  const diskSeries = useRollingSeries(diskPct, 60);
  const tempSeries = useRollingSeries(tempC, 60);

  return (
    <div className="flex flex-col gap-[var(--hx-gap-lg)]">
      {/* Live metric cards */}
      <div
        className="grid gap-[var(--hx-gap-md)]"
        style={{ gridTemplateColumns: "repeat(5, 1fr)" }}
      >
        <MetricCard
          label="CPU"
          value={cpu != null ? `${cpu.toFixed(0)}%` : "—"}
          sub={
            m?.cpu?.cores
              ? `${m.cpu.cores} cores`
              : "—"
          }
          series={cpuSeries}
          color="var(--hx-accent)"
          icon="cpu"
        />
        <MetricCard
          label="Memory"
          value={memPct != null ? `${memPct.toFixed(0)}%` : "—"}
          sub={
            m?.memory?.total_gb
              ? `${(m.memory.used_gb ?? 0).toFixed(1)} / ${m.memory.total_gb.toFixed(0)} GB`
              : "—"
          }
          series={memSeries}
          color="var(--hx-accent-2)"
          icon="memory"
        />
        <MetricCard
          label="Disk"
          value={diskPct != null ? `${diskPct.toFixed(0)}%` : "—"}
          sub={
            m?.disk?.total_gb
              ? `${(m.disk.used_gb ?? 0).toFixed(0)} / ${m.disk.total_gb.toFixed(0)} GB`
              : "—"
          }
          series={diskSeries}
          color="var(--hx-accent)"
          icon="disk"
        />
        <MetricCard
          label="Net"
          value={m?.network?.ip ? "live" : "—"}
          sub={m?.network?.ip ?? "awaiting heartbeat"}
          series={[]}
          color="var(--hx-accent-2)"
          icon="net"
        />
        <MetricCard
          label="CPU temp"
          value={tempC != null ? `${tempC.toFixed(0)}°C` : "—"}
          sub={
            tempC != null
              ? tempC > 80
                ? "hot"
                : "within thermal limits"
              : "not reported"
          }
          series={tempSeries}
          color="var(--hx-warn)"
          icon="temp"
        />
      </div>

      {/* Hardware detail */}
      <div
        className="grid gap-[var(--hx-gap-md)]"
        style={{ gridTemplateColumns: "1.4fr 1fr" }}
      >
        <HxCard padding={18}>
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <div className="hx-mono-tag text-[var(--hx-muted-fg)]">
                CPU · last 5m
              </div>
              <div
                className="mt-1 text-[24px] font-medium"
                style={{ letterSpacing: "-0.02em" }}
              >
                {cpu != null ? `${cpu.toFixed(0)}%` : "—"}
              </div>
            </div>
          </div>
          <Sparkline
            data={cpuSeries}
            width={620}
            height={140}
            color="var(--hx-accent)"
          />
        </HxCard>
        <HxCard padding={0}>
          <div
            className="border-b px-[18px] py-[14px] text-[13.5px] font-medium"
            style={{ borderColor: "var(--hx-border)" }}
          >
            Hardware
          </div>
          <dl className="m-0 p-1">
            {[
              ["CPU", m?.cpu?.model ?? "—"],
              ["Cores", m?.cpu?.cores ? `${m.cpu.cores}` : "—"],
              [
                "Memory",
                m?.memory?.total_gb
                  ? `${m.memory.total_gb.toFixed(0)} GB`
                  : "—",
              ],
              [
                "Storage",
                m?.disk?.total_gb
                  ? `${m.disk.total_gb.toFixed(0)} GB`
                  : "—",
              ],
              [
                "OS",
                m?.os?.name
                  ? `${m.os.name} ${m.os.version ?? ""}`.trim()
                  : "—",
              ],
              ["Kernel", m?.os?.kernel ?? "—"],
              ["IP", m?.network?.ip ?? host.ipAddress ?? "—"],
              ["Uptime", uptimeLabel(m?.uptime_seconds ?? 0)],
              ["Agent", host.agentVersion ? `v${host.agentVersion}` : "—"],
            ].map(([k, v]) => (
              <div
                key={k}
                className="grid border-b px-[14px] py-2 text-[12.5px]"
                style={{
                  gridTemplateColumns: "100px 1fr",
                  borderColor: "var(--hx-border)",
                }}
              >
                <dt
                  className="hx-mono-tag text-[var(--hx-muted-fg)]"
                >
                  {k}
                </dt>
                <dd className="m-0 font-mono text-[12px]">{v}</dd>
              </div>
            ))}
          </dl>
        </HxCard>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  series,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  series: number[];
  color: string;
  icon: HxIconName;
}) {
  const Icon = HxIcon[icon];
  return (
    <HxCard padding={14}>
      <div className="mb-1 flex items-center gap-1.5 text-[var(--hx-muted-fg)]">
        <Icon size={13} />
        <span className="hx-mono-tag">{label}</span>
      </div>
      <div
        className="text-[22px] font-medium leading-none"
        style={{ letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-[var(--hx-muted-fg)]">
        {sub}
      </div>
      <div className="mt-2">
        <Sparkline data={series} width={200} height={32} color={color} />
      </div>
    </HxCard>
  );
}
