"use client";

import Link from "next/link";
import type { Host } from "@/db/schema";
import type { Metrics } from "@/lib/hosts";
import { HxCard, HxCardHeader } from "@/components/hex/card";
import { HxBadge } from "@/components/hex/badge";
import { HxProgress } from "@/components/hex/progress";
import { StatusDot } from "@/components/hex/status-dot";
import { Sparkline } from "@/components/hex/sparkline";
import { HxIcon, type HxIconName } from "@/components/hex/icons";
import { HxGameTile } from "@/components/hex/game-tile";
import { useRollingSeries } from "@/components/hex/use-rolling-series";
import { relativeTime, uptimeLabel } from "@/lib/format";

type DashHost = Host & {
  effectiveStatus: "online" | "offline" | "connecting";
  metrics: Metrics | null;
};

type DashServer = {
  id: string;
  name: string;
  gameId: string;
  hostId: string;
  status: string;
  port: number;
  playersOnline: number;
  maxPlayers: number;
  updatedAt: Date;
};

type Totals = {
  hosts: number;
  onlineHosts: number;
  servers: number;
  runningServers: number;
  players: number;
  slots: number;
};

export function DashboardBody({
  hosts,
  servers,
  totals,
}: {
  hosts: DashHost[];
  servers: DashServer[];
  totals: Totals;
}) {
  // Average CPU/memory across online hosts — drives the top-row sparklines.
  const onlineHosts = hosts.filter((h) => h.effectiveStatus === "online");
  const avgCpu =
    onlineHosts.length === 0
      ? null
      : onlineHosts.reduce(
          (s, h) => s + (h.metrics?.cpu?.usage ?? 0),
          0,
        ) / onlineHosts.length;
  const avgMemPct =
    onlineHosts.length === 0
      ? null
      : onlineHosts.reduce((s, h) => {
          const t = h.metrics?.memory?.total_gb ?? 0;
          const u = h.metrics?.memory?.used_gb ?? 0;
          return s + (t > 0 ? (u / t) * 100 : 0);
        }, 0) / onlineHosts.length;

  const cpuSeries = useRollingSeries(avgCpu, 40);
  const memSeries = useRollingSeries(avgMemPct, 40);
  const playerSeries = useRollingSeries(totals.players, 40);

  const topServers = servers.slice(0, 5);

  return (
    <div className="flex flex-col gap-[var(--hx-gap-lg)]">
      {/* Top stats row */}
      <div
        className="grid gap-[var(--hx-gap-md)]"
        style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
      >
        <StatCard
          label="Hosts"
          value={String(totals.hosts)}
          sub={`${totals.onlineHosts} online · ${Math.max(0, totals.hosts - totals.onlineHosts)} offline`}
          series={cpuSeries}
          color="var(--hx-accent)"
          icon="hosts"
        />
        <StatCard
          label="Servers"
          value={String(totals.servers)}
          sub={`${totals.runningServers} running · ${Math.max(0, totals.servers - totals.runningServers)} stopped`}
          series={memSeries}
          color="var(--hx-accent-2)"
          icon="servers"
        />
        <StatCard
          label="Players"
          value={String(totals.players)}
          sub={
            totals.slots > 0
              ? `of ${totals.slots} slots`
              : "no servers accepting players yet"
          }
          series={playerSeries}
          color="var(--hx-accent)"
          icon="user"
        />
        <StatCard
          label="Avg CPU"
          value={avgCpu != null ? `${avgCpu.toFixed(0)}%` : "—"}
          sub={
            avgMemPct != null
              ? `mem ${avgMemPct.toFixed(0)}% · across ${onlineHosts.length} online ${onlineHosts.length === 1 ? "host" : "hosts"}`
              : "no hosts online"
          }
          series={cpuSeries}
          color="var(--hx-accent-2)"
          icon="cpu"
        />
      </div>

      {/* Hybrid: Hosts | Top servers */}
      <div
        className="grid gap-[var(--hx-gap-md)]"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <HxCard padding={0}>
          <HxCardHeader
            title="Hosts"
            action={
              <Link
                href="/dashboard/hosts"
                className="flex items-center gap-1 text-xs text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
              >
                View all <HxIcon.arrowRight size={11} />
              </Link>
            }
          />
          {hosts.length === 0 ? (
            <EmptyRow
              icon="hosts"
              label="No hosts linked yet"
              action={
                <Link
                  href="/dashboard/hosts/new"
                  className="text-[var(--hx-accent-fg)] underline-offset-2 hover:underline"
                >
                  Add your first host →
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col">
              {hosts.slice(0, 5).map((h) => (
                <HostRow
                  key={h.id}
                  host={h}
                  servers={servers.filter((s) => s.hostId === h.id).length}
                />
              ))}
            </div>
          )}
        </HxCard>

        <HxCard padding={0}>
          <HxCardHeader
            title="Top game servers"
            action={
              <Link
                href="/dashboard/hosts"
                className="flex items-center gap-1 text-xs text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
              >
                View all <HxIcon.arrowRight size={11} />
              </Link>
            }
          />
          {topServers.length === 0 ? (
            <EmptyRow
              icon="servers"
              label="No game servers yet"
              action={
                <Link
                  href="/dashboard/hosts/new"
                  className="text-[var(--hx-accent-fg)] underline-offset-2 hover:underline"
                >
                  Add a host and deploy →
                </Link>
              }
            />
          ) : (
            <div className="flex flex-col">
              {topServers.map((s) => (
                <ServerRow
                  key={s.id}
                  server={s}
                  host={hosts.find((h) => h.id === s.hostId)}
                />
              ))}
            </div>
          )}
        </HxCard>
      </div>

      {/* Activity | Fleet health */}
      <div
        className="grid gap-[var(--hx-gap-md)]"
        style={{ gridTemplateColumns: "1.4fr 1fr" }}
      >
        <HxCard padding={0}>
          <HxCardHeader title="Recent activity" />
          <RecentActivity hosts={hosts} servers={servers} />
        </HxCard>
        <HxCard padding={0}>
          <HxCardHeader title="Fleet health" />
          <div className="p-[18px]">
            <FleetHealth totals={totals} hosts={hosts} />
          </div>
        </HxCard>
      </div>
    </div>
  );
}

function StatCard({
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
    <HxCard padding={16}>
      <div className="mb-2 flex items-center gap-2 text-[var(--hx-muted-fg)]">
        <Icon size={14} />
        <span className="font-mono text-[11.5px] uppercase" style={{ letterSpacing: 0.6 }}>
          {label}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-[28px] font-medium leading-none"
            style={{ letterSpacing: "-0.025em" }}
          >
            {value}
          </div>
          <div className="mt-1.5 truncate text-[11.5px] text-[var(--hx-muted-fg)]">
            {sub}
          </div>
        </div>
        <Sparkline data={series} width={100} height={36} color={color} />
      </div>
    </HxCard>
  );
}

function HostRow({
  host,
  servers,
}: {
  host: DashHost;
  servers: number;
}) {
  const cpu = host.metrics?.cpu?.usage ?? null;
  const cpuSeries = useRollingSeries(cpu, 30);
  const warn = host.effectiveStatus === "connecting";
  const off = host.effectiveStatus === "offline";
  const sparkColor = warn
    ? "var(--hx-warn)"
    : off
      ? "var(--hx-muted-fg)"
      : "var(--hx-accent)";
  return (
    <Link
      href={`/dashboard/hosts/${host.id}`}
      className="grid items-center gap-3 border-t px-[18px] py-3 transition-colors hover:bg-[var(--hx-chip)]"
      style={{
        gridTemplateColumns: "20px 1fr auto",
        borderColor: "var(--hx-border)",
      }}
    >
      <StatusDot status={host.effectiveStatus} size={7} />
      <div className="min-w-0">
        <div className="truncate font-mono text-[13px] font-medium">
          {host.name}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-[var(--hx-muted-fg)]">
          {host.ipAddress ?? "awaiting first heartbeat"} · {servers}{" "}
          {servers === 1 ? "server" : "servers"}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-mono text-[11px] text-[var(--hx-muted-fg)]">
            CPU
          </div>
          <div className="font-mono text-[12.5px]">
            {cpu != null ? `${cpu.toFixed(0)}%` : "—"}
          </div>
        </div>
        <Sparkline data={cpuSeries} width={80} height={28} color={sparkColor} />
      </div>
    </Link>
  );
}

function ServerRow({
  server,
  host,
}: {
  server: DashServer;
  host: DashHost | undefined;
}) {
  const playerSeries = useRollingSeries(server.playersOnline, 24);
  const tone =
    server.status === "running"
      ? "ok"
      : server.status === "installing" || server.status === "queued"
        ? "accent"
        : server.status === "crashed" || server.status === "error"
          ? "err"
          : "neutral";
  return (
    <Link
      href={`/dashboard/hosts/${server.hostId}`}
      className="flex items-center gap-3 border-t px-[18px] py-[11px] transition-colors hover:bg-[var(--hx-chip)]"
      style={{ borderColor: "var(--hx-border)" }}
    >
      <HxGameTile gameId={server.gameId} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[13px] font-medium">
          <span className="truncate">{server.name}</span>
          <HxBadge tone={tone} size="sm">
            {server.status}
          </HxBadge>
        </div>
        <div className="mt-0.5 truncate font-mono text-[11.5px] text-[var(--hx-muted-fg)]">
          {host?.name ?? "—"}:{server.port}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-[12.5px]">
          <span style={{ color: "var(--hx-accent-fg)" }}>
            {server.playersOnline}
          </span>
          <span className="text-[var(--hx-muted-fg)]">/{server.maxPlayers}</span>
        </div>
        <div className="hx-mono-tag text-[var(--hx-muted-fg)]">players</div>
      </div>
      <Sparkline
        data={playerSeries}
        width={60}
        height={22}
        color="var(--hx-accent)"
      />
    </Link>
  );
}

function RecentActivity({
  hosts,
  servers,
}: {
  hosts: DashHost[];
  servers: DashServer[];
}) {
  // Synthesize an activity feed from real data we already have.
  const now = Date.now();
  const events: { kind: string; target: string; msg: string; ago: number; color: string }[] = [];
  for (const h of hosts) {
    if (h.lastHeartbeatAt) {
      const ago = Math.floor((now - new Date(h.lastHeartbeatAt).getTime()) / 1000);
      if (h.effectiveStatus === "online") {
        events.push({
          kind: "online",
          target: h.name,
          msg: `heartbeat`,
          ago,
          color: "var(--hx-accent)",
        });
      } else {
        events.push({
          kind: "offline",
          target: h.name,
          msg: `last heartbeat`,
          ago,
          color: "var(--hx-err)",
        });
      }
    }
  }
  for (const s of servers.slice(0, 8)) {
    const ago = Math.floor((now - new Date(s.updatedAt).getTime()) / 1000);
    events.push({
      kind: s.status,
      target: s.name,
      msg:
        s.status === "running"
          ? "is running"
          : s.status === "installing"
            ? "installing"
            : s.status === "crashed"
              ? "crashed"
              : `status ${s.status}`,
      ago,
      color:
        s.status === "running"
          ? "var(--hx-accent)"
          : s.status === "crashed"
            ? "var(--hx-err)"
            : "var(--hx-accent-2)",
    });
  }
  events.sort((a, b) => a.ago - b.ago);
  const list = events.slice(0, 8);

  if (list.length === 0) {
    return (
      <div className="px-[18px] py-10 text-center text-[13px] text-[var(--hx-muted-fg)]">
        No activity yet. Once your first host checks in, events will appear here.
      </div>
    );
  }

  return (
    <div>
      {list.map((e, i) => (
        <div
          key={i}
          className="grid items-center gap-3 border-t px-[18px] py-[11px] text-[12.5px]"
          style={{
            gridTemplateColumns: "72px 1fr auto",
            borderColor: "var(--hx-border)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              className="h-[5px] w-[5px] shrink-0 rounded-full"
              style={{ background: e.color }}
            />
            <span className="hx-mono-tag text-[var(--hx-muted-fg)]">
              {e.kind}
            </span>
          </div>
          <div>
            <span className="font-mono text-[var(--hx-fg)]">{e.target}</span>
            <span className="text-[var(--hx-muted-fg)]"> {e.msg}</span>
          </div>
          <div className="font-mono text-[11px] text-[var(--hx-muted-fg)]">
            {relativeTime(e.ago)}
          </div>
        </div>
      ))}
    </div>
  );
}

function FleetHealth({
  totals,
  hosts,
}: {
  totals: Totals;
  hosts: DashHost[];
}) {
  const memWarnCount = hosts.filter((h) => {
    const t = h.metrics?.memory?.total_gb ?? 0;
    const u = h.metrics?.memory?.used_gb ?? 0;
    return t > 0 && u / t > 0.85;
  }).length;

  const items: { label: string; value: string; pct: number; color: string }[] = [
    {
      label: "Hosts online",
      value:
        totals.hosts === 0
          ? "0 / 0"
          : `${totals.onlineHosts} / ${totals.hosts}`,
      pct:
        totals.hosts === 0 ? 0 : (totals.onlineHosts / totals.hosts) * 100,
      color: "var(--hx-accent)",
    },
    {
      label: "Servers running",
      value:
        totals.servers === 0
          ? "0 / 0"
          : `${totals.runningServers} / ${totals.servers}`,
      pct:
        totals.servers === 0
          ? 0
          : (totals.runningServers / totals.servers) * 100,
      color: "var(--hx-accent)",
    },
    {
      label: "Player capacity",
      value:
        totals.slots === 0
          ? "—"
          : `${totals.players} / ${totals.slots}`,
      pct: totals.slots === 0 ? 0 : (totals.players / totals.slots) * 100,
      color: "var(--hx-accent-2)",
    },
    {
      label: "Memory headroom",
      value: memWarnCount > 0 ? `${memWarnCount} warn` : "OK",
      pct: hosts.length === 0 ? 0 : 100 - (memWarnCount / hosts.length) * 100,
      color: memWarnCount > 0 ? "var(--hx-warn)" : "var(--hx-accent)",
    },
  ];

  return (
    <div className="flex flex-col gap-[14px]">
      {items.map((i) => (
        <div key={i.label}>
          <div className="mb-1.5 flex justify-between text-[12.5px]">
            <span>{i.label}</span>
            <span className="font-mono text-[var(--hx-muted-fg)]">
              {i.value}
            </span>
          </div>
          <HxProgress value={i.pct} color={i.color} />
        </div>
      ))}
    </div>
  );
}

function EmptyRow({
  icon,
  label,
  action,
}: {
  icon: HxIconName;
  label: string;
  action: React.ReactNode;
}) {
  const Icon = HxIcon[icon];
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--hx-muted-fg)]"
        style={{ background: "var(--hx-chip)" }}
      >
        <Icon size={18} />
      </div>
      <div className="text-[13px] text-[var(--hx-muted-fg)]">{label}</div>
      <div className="text-[13px]">{action}</div>
    </div>
  );
}

// Unused-import guard (relative time used above).
void uptimeLabel;
