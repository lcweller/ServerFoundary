"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Host } from "@/db/schema";
import type { Metrics } from "@/lib/hosts";
import { PageContainer, PageHeader } from "@/components/hex/page";
import { HxCard } from "@/components/hex/card";
import { HxBadge } from "@/components/hex/badge";
import { StatusDot } from "@/components/hex/status-dot";
import { HxIcon } from "@/components/hex/icons";
import { HxButton } from "@/components/hex/button";
import { relativeTime } from "@/lib/format";
import { OverviewTab } from "./overview-tab";
import { GameServersTab } from "./game-servers-tab";
import { TerminalTab } from "./terminal-tab";
import { LogsTab } from "./logs-tab";
import { SettingsTab } from "./settings-tab";

type HostWithStatus = Host & {
  effectiveStatus: "online" | "offline" | "connecting";
};

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "servers", label: "Game servers" },
  { id: "terminal", label: "Terminal" },
  { id: "logs", label: "Logs" },
  { id: "settings", label: "Settings" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function HostDetail({
  initialHost,
  games,
  wsUrl,
}: {
  initialHost: HostWithStatus;
  games: { id: string; name: string; defaultPort: number }[];
  wsUrl: string;
}) {
  const router = useRouter();
  const [host, setHost] = useState<HostWithStatus>(initialHost);
  const [tab, setTab] = useState<TabId>("overview");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/hosts/${initialHost.id}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setHost(data.host);
      }
    } catch {}
  }, [initialHost.id]);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    timer.current = setInterval(refresh, 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [refresh]);

  async function deleteHost() {
    if (
      !confirm(
        `Remove ${host.name}? This disconnects the agent and removes all data.`,
      )
    )
      return;
    const res = await fetch(`/api/hosts/${host.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/hosts");
      router.refresh();
    }
  }

  const metrics = (host.metrics as Metrics | null) ?? null;
  const lastHb = host.lastHeartbeatAt
    ? Math.floor(
        (Date.now() - new Date(host.lastHeartbeatAt).getTime()) / 1000,
      )
    : null;

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="font-mono" style={{ letterSpacing: "-0.015em" }}>
            {host.name}
          </span>
        }
        subtitle={metrics?.os?.name ? `${metrics.os.name} ${metrics.os.version ?? ""}`.trim() : "Awaiting first heartbeat"}
        meta={
          <div className="flex flex-wrap items-center gap-2.5 text-[12px] text-[var(--hx-muted-fg)]">
            <HxBadge
              tone={
                host.effectiveStatus === "online"
                  ? "ok"
                  : host.effectiveStatus === "connecting"
                    ? "warn"
                    : "neutral"
              }
            >
              <StatusDot status={host.effectiveStatus} size={6} />
              {host.effectiveStatus}
            </HxBadge>
            <span className="font-mono">{host.ipAddress ?? "—"}</span>
            <span>·</span>
            <span>
              last heartbeat {lastHb != null ? relativeTime(lastHb) : "never"}
            </span>
            {host.agentVersion && (
              <>
                <span>·</span>
                <span>agent v{host.agentVersion}</span>
              </>
            )}
          </div>
        }
        actions={
          <>
            <HxButton
              variant="secondary"
              size="md"
              icon="terminal"
              onClick={() => setTab("terminal")}
              disabled={host.effectiveStatus !== "online"}
            >
              Open shell
            </HxButton>
            <HxButton
              variant="danger"
              size="md"
              icon="trash"
              onClick={deleteHost}
            >
              Remove host
            </HxButton>
          </>
        }
      />

      {/* Tabs */}
      <div
        className="mb-[var(--hx-gap-lg)] flex gap-1 border-b"
        style={{ borderColor: "var(--hx-border)" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-3.5 py-2.5 text-[13px] font-medium transition-colors"
            style={{
              background: "transparent",
              border: "none",
              marginBottom: -1,
              color:
                tab === t.id ? "var(--hx-fg)" : "var(--hx-muted-fg)",
              borderBottom:
                tab === t.id
                  ? "2px solid var(--hx-fg)"
                  : "2px solid transparent",
              fontWeight: tab === t.id ? 500 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={refresh}
          className="my-1.5 flex items-center gap-1.5 rounded-md px-2 text-[12px] text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
          title="Refresh now"
        >
          <HxIcon.restart size={12} />
          Refresh
        </button>
      </div>

      {tab === "overview" && <OverviewTab host={host} />}
      {tab === "servers" && <GameServersTab host={host} games={games} />}
      {tab === "terminal" && (
        <TerminalTab
          host={host}
          wsUrl={wsUrl}
          onOpenSettings={() => setTab("settings")}
        />
      )}
      {tab === "logs" && <LogsTab host={host} />}
      {tab === "settings" && (
        <SettingsTab
          host={host}
          onDelete={deleteHost}
          onChange={(patch) => setHost((h) => ({ ...h, ...patch }))}
        />
      )}
    </PageContainer>
  );
}
