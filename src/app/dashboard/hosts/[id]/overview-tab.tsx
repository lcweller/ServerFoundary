"use client";

import {
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Monitor,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatGB, formatUptime } from "@/lib/utils";
import type { Host } from "@/db/schema";
import type { Metrics } from "@/lib/hosts";

export function OverviewTab({ host }: { host: Host }) {
  const m = (host.metrics as Metrics | null) ?? {};
  const memPct =
    m.memory?.total_gb && m.memory.total_gb > 0
      ? ((m.memory.used_gb ?? 0) / m.memory.total_gb) * 100
      : 0;
  const diskPct =
    m.disk?.total_gb && m.disk.total_gb > 0
      ? ((m.disk.used_gb ?? 0) / m.disk.total_gb) * 100
      : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <MetricCard icon={<Cpu className="h-4 w-4" />} title="CPU">
        <div className="text-xs text-muted-foreground">
          {m.cpu?.model ?? "Unknown CPU"} · {m.cpu?.cores ?? "?"} cores
        </div>
        <div className="mt-3 text-2xl font-bold">
          {(m.cpu?.usage ?? 0).toFixed(1)}%
        </div>
        <Progress
          value={m.cpu?.usage ?? 0}
          className="mt-2"
          indicatorClassName={
            (m.cpu?.usage ?? 0) >= 90
              ? "bg-destructive"
              : (m.cpu?.usage ?? 0) >= 70
                ? "bg-warning"
                : "bg-primary"
          }
        />
        {m.cpu?.temp != null && (
          <div className="mt-2 text-xs text-muted-foreground">
            Temperature: {m.cpu.temp.toFixed(1)}°C
          </div>
        )}
      </MetricCard>

      <MetricCard icon={<MemoryStick className="h-4 w-4" />} title="Memory">
        <div className="text-xs text-muted-foreground">RAM usage</div>
        <div className="mt-3 text-2xl font-bold">
          {formatGB(m.memory?.used_gb ?? 0)}{" "}
          <span className="text-base font-normal text-muted-foreground">
            / {formatGB(m.memory?.total_gb ?? 0)}
          </span>
        </div>
        <Progress
          value={memPct}
          className="mt-2"
          indicatorClassName={
            memPct >= 90 ? "bg-destructive" : memPct >= 70 ? "bg-warning" : "bg-primary"
          }
        />
      </MetricCard>

      <MetricCard icon={<HardDrive className="h-4 w-4" />} title="Disk">
        <div className="text-xs text-muted-foreground">{m.disk?.path ?? "/"}</div>
        <div className="mt-3 text-2xl font-bold">
          {formatGB(m.disk?.used_gb ?? 0)}{" "}
          <span className="text-base font-normal text-muted-foreground">
            / {formatGB(m.disk?.total_gb ?? 0)}
          </span>
        </div>
        <Progress
          value={diskPct}
          className="mt-2"
          indicatorClassName={
            diskPct >= 90 ? "bg-destructive" : diskPct >= 70 ? "bg-warning" : "bg-primary"
          }
        />
      </MetricCard>

      <MetricCard icon={<Network className="h-4 w-4" />} title="Network">
        <Row label="IP address" value={m.network?.ip ?? host.ipAddress ?? "—"} />
        <Row
          label="Interfaces"
          value={
            Array.isArray(m.network?.interfaces)
              ? `${m.network.interfaces.length} detected`
              : "—"
          }
        />
      </MetricCard>

      <MetricCard icon={<Monitor className="h-4 w-4" />} title="System">
        <Row label="OS" value={`${m.os?.name ?? "—"} ${m.os?.version ?? ""}`.trim()} />
        <Row label="Kernel" value={m.os?.kernel ?? "—"} />
        <Row label="Uptime" value={formatUptime(m.uptime_seconds ?? 0)} />
      </MetricCard>

      <MetricCard icon={<Activity className="h-4 w-4" />} title="Agent">
        <Row label="Version" value={host.agentVersion ?? "—"} />
        <Row
          label="Last heartbeat"
          value={
            host.lastHeartbeatAt
              ? `${Math.max(0, Math.round((Date.now() - new Date(host.lastHeartbeatAt).getTime()) / 1000))}s ago`
              : "never"
          }
        />
      </MetricCard>
    </div>
  );
}

function MetricCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
