"use client";

import { useCallback, useEffect, useState } from "react";
import type { Host, GameServer, Tunnel, Backup, BackupConfig } from "@/db/schema";

/** Game-server row as returned by GET /api/hosts/:id/game-servers —
 *  extended with the joined tunnel row (nullable while the transport
 *  isn't provisioned yet). */
type GameServerWithTunnel = GameServer & { tunnel: Tunnel | null };
import { HxCard, HxCardHeader } from "@/components/hex/card";
import { HxBadge } from "@/components/hex/badge";
import { HxButton } from "@/components/hex/button";
import { HxIcon } from "@/components/hex/icons";
import { HxGameTile } from "@/components/hex/game-tile";
import { HxProgress } from "@/components/hex/progress";
import { formatBytes, relativeTime } from "@/lib/format";

type Game = { id: string; name: string; defaultPort: number };

export function GameServersTab({
  host,
  games,
}: {
  host: Host & { effectiveStatus: "online" | "offline" | "connecting" };
  games: Game[];
}) {
  const [servers, setServers] = useState<GameServerWithTunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [deployOpen, setDeployOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/hosts/${host.id}/game-servers`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      setServers(data.gameServers);
    }
    setLoading(false);
  }, [host.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function act(serverId: string, action: "start" | "stop" | "restart") {
    await fetch(`/api/game-servers/${serverId}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  }
  async function del(serverId: string) {
    if (!confirm("Delete this game server? Files will be removed.")) return;
    await fetch(`/api/game-servers/${serverId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="flex flex-col gap-[var(--hx-gap-md)]">
      <HxCard padding={0}>
        <HxCardHeader
          title={
            <>
              Game servers{" "}
              <span className="ml-1.5 font-mono text-xs text-[var(--hx-muted-fg)]">
                {servers.length}
              </span>
            </>
          }
          action={
            <HxButton
              variant="primary"
              size="sm"
              icon="plus"
              disabled={host.effectiveStatus !== "online"}
              onClick={() => setDeployOpen(true)}
            >
              Deploy
            </HxButton>
          }
        />
        {loading ? (
          <div className="px-[18px] py-10 text-center text-sm text-[var(--hx-muted-fg)]">
            Loading…
          </div>
        ) : servers.length === 0 ? (
          <div className="px-[18px] py-10 text-center text-sm text-[var(--hx-muted-fg)]">
            No game servers yet.{" "}
            <button
              onClick={() => setDeployOpen(true)}
              className="text-[var(--hx-accent-fg)] underline-offset-2 hover:underline"
              disabled={host.effectiveStatus !== "online"}
            >
              Deploy the first one →
            </button>
          </div>
        ) : (
          servers.map((s) => (
            <ServerRow
              key={s.id}
              server={s}
              gameName={games.find((g) => g.id === s.gameId)?.name ?? s.gameId}
              hostOnline={host.effectiveStatus === "online"}
              onAct={(a) => act(s.id, a)}
              onDelete={() => del(s.id)}
            />
          ))
        )}
      </HxCard>

      {deployOpen && (
        <DeployDialog
          hostId={host.id}
          games={games}
          onClose={() => setDeployOpen(false)}
          onDeployed={() => {
            load();
            setDeployOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ServerRow({
  server,
  gameName,
  hostOnline,
  onAct,
  onDelete,
}: {
  server: GameServerWithTunnel;
  gameName: string;
  hostOnline: boolean;
  onAct: (a: "start" | "stop" | "restart") => void;
  onDelete: () => void;
}) {
  const [backupsOpen, setBackupsOpen] = useState(false);
  const tone =
    server.status === "running"
      ? "ok"
      : server.status === "installing" || server.status === "queued"
        ? "accent"
        : server.status === "crashed" || server.status === "error"
          ? "err"
          : "neutral";
  const playerPct =
    server.maxPlayers > 0
      ? (server.playersOnline / server.maxPlayers) * 100
      : 0;
  return (
    <div
      className="border-t"
      style={{ borderColor: "var(--hx-border)" }}
    >
      <div className="flex items-center gap-3 px-[18px] py-[11px]">
        <HxGameTile gameId={server.gameId} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[13px] font-medium">{server.name}</div>
            <HxBadge tone={tone} size="sm">
              {server.status}
            </HxBadge>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11.5px] text-[var(--hx-muted-fg)]">
            {gameName} · port {server.port} · {server.memMaxMb} MiB ·{" "}
            {server.cpuPct}% CPU
          </div>
          <PublicAddress tunnel={server.tunnel} />
        </div>
        <div className="w-36">
          <div className="flex justify-between font-mono text-[11px]">
            <span className="text-[var(--hx-muted-fg)]">players</span>
            <span>
              <span className="text-[var(--hx-accent-fg)]">
                {server.playersOnline}
              </span>
              <span className="text-[var(--hx-muted-fg)]">
                /{server.maxPlayers}
              </span>
            </span>
          </div>
          <HxProgress value={playerPct} color="var(--hx-accent)" className="mt-1" />
        </div>
        <div className="flex gap-1.5">
          <HxButton
            size="sm"
            variant="secondary"
            icon="play"
            disabled={!hostOnline || server.status === "running"}
            onClick={() => onAct("start")}
          >
            Start
          </HxButton>
          <HxButton
            size="sm"
            variant="secondary"
            icon="stop"
            disabled={!hostOnline || server.status !== "running"}
            onClick={() => onAct("stop")}
          >
            Stop
          </HxButton>
          <HxButton
            size="sm"
            variant="secondary"
            icon="restart"
            disabled={!hostOnline || server.status === "installing"}
            onClick={() => onAct("restart")}
          >
            Restart
          </HxButton>
          <HxButton
            size="sm"
            variant="secondary"
            icon="backups"
            onClick={() => setBackupsOpen((v) => !v)}
          >
            Backups
          </HxButton>
          <HxButton
            size="sm"
            variant="danger"
            icon="trash"
            onClick={onDelete}
          >
            Delete
          </HxButton>
        </div>
      </div>
      {backupsOpen && (
        <BackupsPanel server={server} hostOnline={hostOnline} />
      )}
    </div>
  );
}

function BackupsPanel({
  server,
  hostOnline,
}: {
  server: GameServerWithTunnel;
  hostOnline: boolean;
}) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch(`/api/game-servers/${server.id}/backups`, { cache: "no-store" }),
        fetch(`/api/game-servers/${server.id}/backup-config`, { cache: "no-store" }),
      ]);
      if (a.ok) {
        const data = (await a.json()) as { backups: Backup[] };
        setBackups(data.backups ?? []);
      }
      if (b.ok) {
        const data = (await b.json()) as { config: BackupConfig };
        setConfig(data.config);
      }
    } catch {}
    setLoading(false);
  }, [server.id]);

  useEffect(() => {
    load();
    // Poll while running backups exist so UI catches up to the agent.
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function backupNow() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/game-servers/${server.id}/backups`, {
      method: "POST",
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Backup failed to start.");
    }
    setBusy(false);
    load();
  }

  async function restore(b: Backup) {
    if (
      !confirm(
        `Restore "${server.name}" from backup taken ${relativeTime(
          Math.floor((Date.now() - new Date(b.startedAt).getTime()) / 1000),
        )}? The server will be stopped, replaced, and restarted.`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/game-servers/${server.id}/backups/${b.id}/restore`,
      { method: "POST" },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Restore failed to start.");
    }
    setBusy(false);
    load();
  }

  async function del(b: Backup) {
    if (!confirm("Delete this backup? The file will be removed from disk.")) {
      return;
    }
    setBusy(true);
    await fetch(`/api/game-servers/${server.id}/backups/${b.id}`, {
      method: "DELETE",
    });
    setBusy(false);
    load();
  }

  async function patchConfig(patch: Partial<BackupConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    const res = await fetch(`/api/game-servers/${server.id}/backup-config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      // Roll back optimistic update.
      setConfig(config);
    }
  }

  return (
    <div
      className="border-t px-[18px] py-[14px]"
      style={{
        borderColor: "var(--hx-border)",
        background: "var(--hx-chip)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[13px] font-medium">Backups</div>
        <div className="flex items-center gap-3 text-[12px]">
          {config && (
            <>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => patchConfig({ enabled: e.target.checked })}
                />
                <span>Schedule</span>
              </label>
              <label className="flex items-center gap-1">
                <span className="text-[var(--hx-muted-fg)]">every</span>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={config.everyHours}
                  onChange={(e) =>
                    patchConfig({ everyHours: Number(e.target.value) })
                  }
                  className="h-7 w-14 rounded-md border px-2 font-mono text-[12px]"
                  style={{
                    background: "var(--hx-bg)",
                    borderColor: "var(--hx-border)",
                    color: "var(--hx-fg)",
                  }}
                />
                <span className="text-[var(--hx-muted-fg)]">h, keep</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={config.retentionCount}
                  onChange={(e) =>
                    patchConfig({ retentionCount: Number(e.target.value) })
                  }
                  className="h-7 w-14 rounded-md border px-2 font-mono text-[12px]"
                  style={{
                    background: "var(--hx-bg)",
                    borderColor: "var(--hx-border)",
                    color: "var(--hx-fg)",
                  }}
                />
              </label>
            </>
          )}
          <HxButton
            size="sm"
            variant="primary"
            icon="backups"
            disabled={busy || !hostOnline}
            onClick={backupNow}
          >
            Back up now
          </HxButton>
        </div>
      </div>
      {error && (
        <div
          className="mt-2 rounded-md border px-3 py-2 text-[12px]"
          style={{
            background: "color-mix(in oklch, var(--hx-err) 10%, transparent)",
            borderColor: "color-mix(in oklch, var(--hx-err) 30%, transparent)",
            color: "var(--hx-err)",
          }}
        >
          {error}
        </div>
      )}
      <div className="mt-3">
        {loading ? (
          <div className="text-[12px] text-[var(--hx-muted-fg)]">Loading…</div>
        ) : backups.length === 0 ? (
          <div className="text-[12px] text-[var(--hx-muted-fg)]">
            No backups yet. Click <span className="font-medium">Back up now</span>{" "}
            to create one, or enable the schedule above.
          </div>
        ) : (
          <div className="flex flex-col">
            {backups.map((b) => {
              const ago = Math.floor(
                (Date.now() - new Date(b.startedAt).getTime()) / 1000,
              );
              const tone: "ok" | "warn" | "err" | "accent" | "neutral" =
                b.status === "success"
                  ? "ok"
                  : b.status === "running" || b.status === "pending"
                    ? "accent"
                    : "err";
              return (
                <div
                  key={b.id}
                  className="grid items-center gap-3 border-t py-[8px] text-[12.5px]"
                  style={{
                    gridTemplateColumns: "90px 90px 1fr auto",
                    borderColor: "var(--hx-border)",
                  }}
                >
                  <HxBadge size="sm" tone={tone}>
                    {b.status}
                  </HxBadge>
                  <span className="hx-mono-tag text-[var(--hx-muted-fg)]">
                    {b.trigger}
                  </span>
                  <span className="truncate font-mono text-[11.5px]">
                    {b.status === "success"
                      ? formatBytes(b.sizeBytes ?? 0)
                      : b.error
                        ? b.error
                        : "—"}
                    <span className="ml-2 text-[var(--hx-muted-fg)]">
                      {relativeTime(ago)}
                    </span>
                  </span>
                  <span className="flex gap-1.5">
                    <HxButton
                      size="sm"
                      variant="secondary"
                      icon="restart"
                      disabled={b.status !== "success" || !hostOnline || busy}
                      onClick={() => restore(b)}
                    >
                      Restore
                    </HxButton>
                    <HxButton
                      size="sm"
                      variant="ghost"
                      icon="trash"
                      disabled={busy}
                      onClick={() => del(b)}
                    >
                      Delete
                    </HxButton>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DeployDialog({
  hostId,
  games,
  onClose,
  onDeployed,
}: {
  hostId: string;
  games: Game[];
  onClose: () => void;
  onDeployed: () => void;
}) {
  const [gameId, setGameId] = useState(games[0]?.id ?? "");
  const [name, setName] = useState("");
  const [port, setPort] = useState<string>(String(games[0]?.defaultPort ?? 27015));
  // PROJECT.md §3.9 — per-server resource caps. Defaults match the
  // server-side clamp's defaults so the API doesn't override them.
  const [memMaxMb, setMemMaxMb] = useState<string>("4096");
  const [cpuPct, setCpuPct] = useState<string>("200");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const g = games.find((x) => x.id === gameId);
    if (g) {
      setPort(String(g.defaultPort));
      setName((n) => (n ? n : `${g.name} server`));
    }
  }, [gameId, games]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/hosts/${hostId}/game-servers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameId,
        name,
        port: Number(port),
        memMaxMb: Number(memMaxMb),
        cpuPct: Number(cpuPct),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Deploy failed.");
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    onDeployed();
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{
        background: "color-mix(in oklch, var(--hx-fg) 30%, transparent)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl border shadow-2xl"
        style={{
          background: "var(--hx-bg)",
          borderColor: "var(--hx-border)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3.5 text-[13.5px] font-medium"
          style={{ borderColor: "var(--hx-border)" }}
        >
          Deploy a game server
          <button
            onClick={onClose}
            className="text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
          >
            <HxIcon.x size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="hx-mono-tag text-[var(--hx-muted-fg)]">Game</span>
            <select
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
              className="h-9 rounded-lg border px-2 text-[13.5px]"
              style={{
                background: "var(--hx-bg)",
                borderColor: "var(--hx-border)",
                color: "var(--hx-fg)",
              }}
            >
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="hx-mono-tag text-[var(--hx-muted-fg)]">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-lg border px-3 text-[13.5px]"
              style={{
                background: "var(--hx-bg)",
                borderColor: "var(--hx-border)",
                color: "var(--hx-fg)",
              }}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="hx-mono-tag text-[var(--hx-muted-fg)]">Port</span>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="h-9 rounded-lg border px-3 font-mono text-[13.5px]"
              style={{
                background: "var(--hx-bg)",
                borderColor: "var(--hx-border)",
                color: "var(--hx-fg)",
              }}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="hx-mono-tag text-[var(--hx-muted-fg)]">
                Memory cap (MiB)
              </span>
              <input
                type="number"
                min={256}
                max={65536}
                step={256}
                value={memMaxMb}
                onChange={(e) => setMemMaxMb(e.target.value)}
                className="h-9 rounded-lg border px-3 font-mono text-[13.5px]"
                style={{
                  background: "var(--hx-bg)",
                  borderColor: "var(--hx-border)",
                  color: "var(--hx-fg)",
                }}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="hx-mono-tag text-[var(--hx-muted-fg)]">
                CPU %
              </span>
              <input
                type="number"
                min={25}
                max={1600}
                step={25}
                value={cpuPct}
                onChange={(e) => setCpuPct(e.target.value)}
                className="h-9 rounded-lg border px-3 font-mono text-[13.5px]"
                style={{
                  background: "var(--hx-bg)",
                  borderColor: "var(--hx-border)",
                  color: "var(--hx-fg)",
                }}
              />
            </label>
          </div>
          <p className="text-[11.5px] text-[var(--hx-muted-fg)]">
            Best-effort caps applied via prlimit + nice. 100% = one full
            core. Real cgroup quotas land in a follow-up phase.
          </p>
          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-[12.5px]"
              style={{
                background:
                  "color-mix(in oklch, var(--hx-err) 10%, transparent)",
                borderColor:
                  "color-mix(in oklch, var(--hx-err) 30%, transparent)",
                color: "var(--hx-err)",
              }}
            >
              {error}
            </div>
          )}
        </div>
        <div
          className="flex justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: "var(--hx-border)" }}
        >
          <HxButton variant="ghost" onClick={onClose}>
            Cancel
          </HxButton>
          <HxButton
            variant="primary"
            disabled={submitting || !gameId || !name}
            onClick={submit}
          >
            Deploy
          </HxButton>
        </div>
      </div>
    </div>
  );
}


/**
 * Shows the external address a player connects to. Null tunnel renders
 * a muted "Not yet published" pill — the in-container relay (ADR 0001
 * Option A) or the v2 WireGuard relay will back-fill this row.
 */
function PublicAddress({ tunnel }: { tunnel: Tunnel | null }) {
  if (!tunnel || !tunnel.externalHostname) {
    return (
      <div
        className="mt-1 flex items-center gap-1.5 font-mono text-[11px]"
        style={{ color: "var(--hx-muted-fg)" }}
        title="A public address for this game server is provisioned once the platform relay is configured. See docs/decisions/0001-game-traffic-transport.md."
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--hx-border-strong)" }}
        />
        Not yet published
      </div>
    );
  }
  const addr = tunnel.externalPort
    ? `${tunnel.externalHostname}:${tunnel.externalPort}`
    : tunnel.externalHostname;
  return (
    <div
      className="mt-1 flex items-center gap-1.5 font-mono text-[11px]"
      style={{ color: "var(--hx-accent-fg)" }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--hx-accent)" }}
      />
      <span className="truncate">{addr}</span>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(addr)}
        className="ml-1 text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
        title="Copy"
      >
        <HxIcon.copy size={11} />
      </button>
    </div>
  );
}
