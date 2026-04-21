import Link from "next/link";
import { Cpu, MemoryStick, HardDrive, Gamepad2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatusDot } from "@/components/dashboard/status-dot";
import type { Host } from "@/db/schema";
import type { Metrics } from "@/lib/hosts";

export function HostCard({
  host,
}: {
  host: Host & { effectiveStatus: "online" | "offline" | "connecting" };
}) {
  const metrics = (host.metrics as Metrics | null) ?? {};
  const cpuUsage = metrics.cpu?.usage ?? 0;
  const memTotal = metrics.memory?.total_gb ?? 0;
  const memUsed = metrics.memory?.used_gb ?? 0;
  const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
  const diskTotal = metrics.disk?.total_gb ?? 0;
  const diskUsed = metrics.disk?.used_gb ?? 0;
  const diskPct = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;

  return (
    <Link
      href={`/dashboard/hosts/${host.id}`}
      className="block transition-transform hover:-translate-y-0.5"
    >
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <StatusDot status={host.effectiveStatus} />
                <h3 className="truncate font-semibold">{host.name}</h3>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {host.ipAddress ?? "Awaiting first heartbeat"}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <MetricRow
            icon={<Cpu className="h-3.5 w-3.5" />}
            label="CPU"
            value={`${cpuUsage.toFixed(0)}%`}
            pct={cpuUsage}
          />
          <MetricRow
            icon={<MemoryStick className="h-3.5 w-3.5" />}
            label="RAM"
            value={
              memTotal > 0
                ? `${memUsed.toFixed(1)} / ${memTotal.toFixed(0)} GB`
                : "—"
            }
            pct={memPct}
          />
          <MetricRow
            icon={<HardDrive className="h-3.5 w-3.5" />}
            label="Disk"
            value={
              diskTotal > 0
                ? `${diskUsed.toFixed(0)} / ${diskTotal.toFixed(0)} GB`
                : "—"
            }
            pct={diskPct}
          />
          <div className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Gamepad2 className="h-3.5 w-3.5" />
            <span>
              {(host.metrics as Metrics | null)?.uptime_seconds !== undefined
                ? "Connected"
                : "Waiting for first data"}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MetricRow({
  icon,
  label,
  value,
  pct,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  pct: number;
}) {
  const indicator =
    pct >= 90
      ? "bg-destructive"
      : pct >= 70
        ? "bg-warning"
        : "bg-primary";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </div>
        <span className="font-medium">{value}</span>
      </div>
      <Progress value={Math.min(100, Math.max(0, pct))} indicatorClassName={indicator} />
    </div>
  );
}
