"use client";

import { useCallback, useEffect, useState } from "react";
import type { Host, GameServerLog } from "@/db/schema";
import { HxCard } from "@/components/hex/card";
import { HxIcon } from "@/components/hex/icons";
import { StatusDot } from "@/components/hex/status-dot";

const SEV_COLORS: Record<string, string> = {
  info: "var(--hx-muted-fg)",
  warn: "var(--hx-warn)",
  error: "var(--hx-err)",
  debug: "var(--hx-accent-2)",
};

export function LogsTab({ host }: { host: Host }) {
  const [logs, setLogs] = useState<GameServerLog[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");

  const load = useCallback(async () => {
    const res = await fetch(`/api/hosts/${host.id}/logs`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setLogs(data.logs);
      setServers(data.servers);
    }
  }, [host.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = logs.filter((l) => {
    if (level !== "all" && l.level !== level) return false;
    if (source !== "all") {
      if (
        source === "system" ||
        source === "agent" ||
        source === "game"
      ) {
        if (l.source !== source) return false;
      } else if (l.gameServerId !== source) return false;
    }
    return true;
  });

  return (
    <HxCard padding={0} className="overflow-hidden">
      <div
        className="flex items-center gap-2 border-b px-3.5 py-2.5"
        style={{ borderColor: "var(--hx-border)" }}
      >
        <StatusDot status="online" size={6} />
        <div className="font-mono text-[12px]">streaming from {host.name}</div>
        <div className="flex-1" />
        {["all", "info", "warn", "error"].map((s) => (
          <button
            key={s}
            onClick={() => setLevel(s)}
            className="rounded border px-2 py-0.5 font-mono text-[11px] uppercase"
            style={{
              background: level === s ? "var(--hx-chip)" : "transparent",
              borderColor: "var(--hx-border)",
              color: "var(--hx-fg)",
            }}
          >
            {s}
          </button>
        ))}
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-7 rounded-md border px-2 text-[12px]"
          style={{
            background: "var(--hx-bg)",
            borderColor: "var(--hx-border)",
            color: "var(--hx-fg)",
          }}
        >
          <option value="all">All sources</option>
          <option value="system">System</option>
          <option value="agent">Agent</option>
          <option value="game">Game</option>
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div
        className="scrollbar-thin font-mono"
        style={{
          background: "#0b0d0f",
          color: "#c8d0d6",
          fontSize: 12,
          lineHeight: 1.55,
          padding: 14,
          minHeight: 320,
          maxHeight: 520,
          overflowY: "auto",
        }}
      >
        {filtered.length === 0 && (
          <div className="px-1 py-6 text-center text-[var(--hx-muted-fg)]">
            No log lines yet.
          </div>
        )}
        {filtered.map((l) => (
          <div key={l.id} className="flex gap-2.5 py-[1px]">
            <span className="shrink-0 text-[#5b6470]">
              {new Date(l.createdAt).toISOString().slice(11, 19)}
            </span>
            <span
              className="w-12 shrink-0 uppercase"
              style={{ color: SEV_COLORS[l.level] ?? "#c8d0d6" }}
            >
              {l.level}
            </span>
            <span className="w-14 shrink-0 text-[#7a8593]">[{l.source}]</span>
            <span className="whitespace-pre-wrap break-all">{l.message}</span>
          </div>
        ))}
      </div>
      {/* keep HxIcon import referenced for future use */}
      <span className="hidden">
        <HxIcon.logs />
      </span>
    </HxCard>
  );
}
