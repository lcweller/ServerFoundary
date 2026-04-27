"use client";

import { useCallback, useEffect, useState } from "react";
import type { Host, AuditEvent } from "@/db/schema";
import { HxCard } from "@/components/hex/card";
import { HxButton } from "@/components/hex/button";
import { relativeTime } from "@/lib/format";

export function SettingsTab({
  host,
  onDelete,
  onChange,
}: {
  host: Host;
  onDelete: () => void;
  onChange?: (patch: Partial<Host>) => void;
}) {
  const [name, setName] = useState(host.name);
  const [savingName, setSavingName] = useState(false);
  const [savedName, setSavedName] = useState(false);

  const [terminalEnabled, setTerminalEnabled] = useState(host.terminalEnabled);
  const [savingTerm, setSavingTerm] = useState(false);

  async function saveName() {
    setSavingName(true);
    const res = await fetch(`/api/hosts/${host.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setSavingName(false);
    if (res.ok) {
      setSavedName(true);
      onChange?.({ name });
      setTimeout(() => setSavedName(false), 1500);
    }
  }

  async function toggleTerminal(next: boolean) {
    setSavingTerm(true);
    setTerminalEnabled(next); // optimistic
    const res = await fetch(`/api/hosts/${host.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ terminalEnabled: next }),
    });
    if (!res.ok) {
      setTerminalEnabled(!next);
    } else {
      onChange?.({ terminalEnabled: next });
    }
    setSavingTerm(false);
  }

  return (
    <div className="flex flex-col gap-[var(--hx-gap-md)]">
      <HxCard padding={20}>
        <div className="mb-3 text-[14px] font-medium">Host name</div>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 flex-1 rounded-lg border px-3 text-[13.5px]"
            style={{
              background: "var(--hx-bg)",
              borderColor: "var(--hx-border)",
              color: "var(--hx-fg)",
            }}
          />
          <HxButton
            variant="secondary"
            disabled={savingName || name === host.name}
            onClick={saveName}
          >
            {savedName ? "Saved" : "Save"}
          </HxButton>
        </div>
        <div className="mt-2 text-[12px] text-[var(--hx-muted-fg)]">
          Used as the label in the dashboard and on this host&apos;s logs.
        </div>
      </HxCard>

      {/* Remote terminal opt-in (PROJECT.md §3.6) */}
      <HxCard padding={20}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium">Remote terminal</div>
            <p className="mt-1 max-w-xl text-[12.5px] text-[var(--hx-muted-fg)]">
              When on, the dashboard&apos;s Terminal tab can open a shell on
              this host. Off by default. Every session is recorded in the
              audit log below with timestamp and source IP.
            </p>
          </div>
          <Toggle
            value={terminalEnabled}
            disabled={savingTerm}
            onChange={toggleTerminal}
          />
        </div>
      </HxCard>

      <HxCard padding={20}>
        <div className="mb-3 text-[14px] font-medium">Agent</div>
        <div
          className="grid items-center gap-3 text-[13px]"
          style={{ gridTemplateColumns: "1fr auto" }}
        >
          <div>
            <div>
              Running{" "}
              <span className="font-mono">
                {host.agentVersion ? `v${host.agentVersion}` : "—"}
              </span>
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--hx-muted-fg)]">
              Agents self-update from the dashboard&apos;s{" "}
              <span className="font-mono">/agent.cjs</span>. Run the install
              command again to force an update.
            </div>
          </div>
        </div>
      </HxCard>

      {/* Audit log — last 100 events for this host (§3.6, §6.1). */}
      <AuditLog hostId={host.id} />

      <HxCard
        padding={20}
        style={{
          borderColor:
            "color-mix(in oklch, var(--hx-err) 40%, var(--hx-border))",
        }}
      >
        <div
          className="mb-1 text-[14px] font-medium"
          style={{ color: "var(--hx-err)" }}
        >
          Danger zone
        </div>
        <div className="mb-3 text-[13px] text-[var(--hx-muted-fg)]">
          Removing this host will stop all game servers running on it and
          unenroll the agent. Server data is preserved on disk.
        </div>
        <HxButton variant="danger" icon="trash" onClick={onDelete}>
          Remove host
        </HxButton>
      </HxCard>
    </div>
  );
}

function Toggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:opacity-60"
      style={{
        background: value
          ? "color-mix(in oklch, var(--hx-accent) 80%, transparent)"
          : "var(--hx-chip)",
        borderColor: value ? "var(--hx-accent)" : "var(--hx-border)",
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
        style={{
          transform: value ? "translateX(20px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}

const KIND_LABELS: Record<string, string> = {
  host_create: "host created",
  host_rename: "host renamed",
  host_delete: "host deleted",
  host_terminal_toggle: "terminal toggled",
  game_server_deploy: "deploy",
  game_server_start: "start",
  game_server_stop: "stop",
  game_server_restart: "restart",
  game_server_delete: "delete",
  terminal_open: "terminal opened",
  terminal_close: "terminal closed",
  backup_create: "backup",
  backup_restore: "restore",
  backup_delete: "backup deleted",
  backup_config_change: "backup config",
  agent_update_started: "agent update started",
  agent_update_success: "agent updated",
  agent_update_failed: "agent update failed",
};

const KIND_COLORS: Record<string, string> = {
  terminal_open: "var(--hx-accent-2)",
  terminal_close: "var(--hx-muted-fg)",
  host_terminal_toggle: "var(--hx-warn)",
  host_delete: "var(--hx-err)",
  game_server_delete: "var(--hx-err)",
  game_server_deploy: "var(--hx-accent)",
  game_server_start: "var(--hx-accent)",
  game_server_stop: "var(--hx-warn)",
  game_server_restart: "var(--hx-accent-2)",
  backup_create: "var(--hx-accent)",
  backup_restore: "var(--hx-accent-2)",
  backup_delete: "var(--hx-warn)",
  agent_update_started: "var(--hx-accent-2)",
  agent_update_success: "var(--hx-accent)",
  agent_update_failed: "var(--hx-err)",
};

function AuditLog({ hostId }: { hostId: string }) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/hosts/${hostId}/audit`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { events: AuditEvent[] };
        setEvents(data.events ?? []);
      }
    } catch {}
    setLoading(false);
  }, [hostId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <HxCard padding={0}>
      <div
        className="flex items-center justify-between border-b px-[18px] py-[14px]"
        style={{ borderColor: "var(--hx-border)" }}
      >
        <div className="text-[14px] font-medium">Audit log</div>
        <div className="font-mono text-[11px] text-[var(--hx-muted-fg)]">
          last {events.length} {events.length === 1 ? "event" : "events"}
        </div>
      </div>
      {loading && events.length === 0 ? (
        <div className="px-[18px] py-6 text-center text-[12.5px] text-[var(--hx-muted-fg)]">
          Loading…
        </div>
      ) : events.length === 0 ? (
        <div className="px-[18px] py-10 text-center text-[12.5px] text-[var(--hx-muted-fg)]">
          No audit events yet. Deploy a server or open the terminal to see
          entries here.
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto">
          {events.map((e) => {
            const ago = Math.max(
              0,
              Math.floor((Date.now() - new Date(e.createdAt).getTime()) / 1000),
            );
            const label = KIND_LABELS[e.kind] ?? e.kind;
            const color = KIND_COLORS[e.kind] ?? "var(--hx-muted-fg)";
            return (
              <div
                key={e.id}
                className="grid items-center gap-3 border-t px-[18px] py-[10px] text-[12.5px]"
                style={{
                  gridTemplateColumns: "12px 130px 1fr 110px",
                  borderColor: "var(--hx-border)",
                }}
              >
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="hx-mono-tag text-[var(--hx-muted-fg)]">
                  {label}
                </span>
                <span className="truncate">
                  {e.target ? (
                    <span className="font-mono">{e.target}</span>
                  ) : (
                    <span className="text-[var(--hx-muted-fg)]">—</span>
                  )}
                  {e.sourceIp && (
                    <span className="ml-2 font-mono text-[11px] text-[var(--hx-muted-fg)]">
                      from {e.sourceIp}
                    </span>
                  )}
                </span>
                <span className="text-right font-mono text-[11px] text-[var(--hx-muted-fg)]">
                  {relativeTime(ago)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </HxCard>
  );
}
