"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Pencil,
  Terminal as TerminalIcon,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/dashboard/status-dot";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Host } from "@/db/schema";
import type { Metrics } from "@/lib/hosts";
import { OverviewTab } from "./overview-tab";
import { GameServersTab } from "./game-servers-tab";
import { TerminalTab } from "./terminal-tab";
import { LogsTab } from "./logs-tab";
import { SettingsTab } from "./settings-tab";

type HostWithStatus = Host & {
  effectiveStatus: "online" | "offline" | "connecting";
};

export function HostDetail({
  initialHost,
  games,
}: {
  initialHost: HostWithStatus;
  games: { id: string; name: string; defaultPort: number }[];
}) {
  const router = useRouter();
  const [host, setHost] = useState<HostWithStatus>(initialHost);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialHost.name);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function saveName() {
    if (nameDraft.trim().length === 0 || nameDraft === host.name) {
      setEditingName(false);
      setNameDraft(host.name);
      return;
    }
    const res = await fetch(`/api/hosts/${host.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nameDraft.trim() }),
    });
    if (res.ok) {
      setHost({ ...host, name: nameDraft.trim() });
    }
    setEditingName(false);
  }

  async function deleteHost() {
    setDeleting(true);
    const res = await fetch(`/api/hosts/${host.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/hosts");
      router.refresh();
    }
    setDeleting(false);
    setDeleteOpen(false);
  }

  const metrics = (host.metrics as Metrics | null) ?? {};

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-8 w-64"
                  autoFocus
                  onBlur={saveName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setEditingName(false);
                      setNameDraft(host.name);
                    }
                  }}
                />
                <Button size="sm" variant="ghost" onClick={saveName}>
                  <Check className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  {host.name}
                </h1>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setNameDraft(host.name);
                    setEditingName(true);
                  }}
                  aria-label="Edit name"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <StatusBadge status={host.effectiveStatus} />
            <span className="font-mono">{host.ipAddress ?? "—"}</span>
            {host.agentVersion && (
              <span className="text-xs">agent {host.agentVersion}</span>
            )}
            {metrics.os?.name && (
              <span className="text-xs">
                {metrics.os.name} {metrics.os.version}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={host.effectiveStatus !== "online"}
            onClick={() => {
              const el = document.getElementById("terminal-tab-trigger");
              el?.click();
            }}
          >
            <TerminalIcon className="h-4 w-4" />
            Open Terminal
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete Host
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="game-servers">Game Servers</TabsTrigger>
          <TabsTrigger value="terminal" id="terminal-tab-trigger">
            Terminal
          </TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab host={host} />
        </TabsContent>
        <TabsContent value="game-servers">
          <GameServersTab host={host} games={games} />
        </TabsContent>
        <TabsContent value="terminal">
          <TerminalTab host={host} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab host={host} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab host={host} onDelete={() => setDeleteOpen(true)} />
        </TabsContent>
      </Tabs>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this host?</DialogTitle>
            <DialogDescription>
              This will disconnect the server and remove all associated data,
              including game servers and logs. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteHost}
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete Host
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
