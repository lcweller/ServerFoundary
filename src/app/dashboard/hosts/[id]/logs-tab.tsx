"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/empty-state";
import { FileText } from "lucide-react";
import type { Host, GameServerLog } from "@/db/schema";

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
      if (source === "system" || source === "agent" || source === "game") {
        if (l.source !== source) return false;
      } else if (l.gameServerId !== source) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-[140px]">
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All levels</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[180px]">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="game">Game output</SelectItem>
              {servers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" />}
          title="No logs yet"
          description="Deploy a game server and logs will appear here."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="scrollbar-thin max-h-[600px] overflow-y-auto font-mono text-xs">
              {filtered.map((l) => (
                <LogRow key={l.id} log={l} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LogRow({ log }: { log: GameServerLog }) {
  const levelColor =
    log.level === "error"
      ? "text-destructive"
      : log.level === "warn"
        ? "text-warning"
        : "text-muted-foreground";
  const ts = new Date(log.createdAt).toISOString().slice(11, 19);
  return (
    <div className="flex gap-4 border-b border-border/60 px-4 py-2 last:border-b-0 hover:bg-accent/20">
      <span className="text-muted-foreground">{ts}</span>
      <span className={`w-12 uppercase ${levelColor}`}>{log.level}</span>
      <span className="w-16 text-muted-foreground">{log.source}</span>
      <span className="flex-1 whitespace-pre-wrap break-all">{log.message}</span>
    </div>
  );
}
