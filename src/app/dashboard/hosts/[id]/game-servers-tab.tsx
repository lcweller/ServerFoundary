"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Gamepad2,
  Loader2,
  Play,
  Plus,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { Host, GameServer } from "@/db/schema";

type Game = { id: string; name: string; defaultPort: number };

export function GameServersTab({
  host,
  games,
}: {
  host: Host & { effectiveStatus: "online" | "offline" | "connecting" };
  games: Game[];
}) {
  const [servers, setServers] = useState<GameServer[]>([]);
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
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {servers.length} game {servers.length === 1 ? "server" : "servers"} on
          this host
        </p>
        <Button
          onClick={() => setDeployOpen(true)}
          disabled={host.effectiveStatus !== "online"}
        >
          <Plus className="h-4 w-4" />
          Deploy New Game Server
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : servers.length === 0 ? (
        <EmptyState
          icon={<Gamepad2 className="h-5 w-5" />}
          title="No game servers yet"
          description="Deploy your first one. SteamCMD will download and install the game files automatically."
          action={
            <Button
              onClick={() => setDeployOpen(true)}
              disabled={host.effectiveStatus !== "online"}
            >
              <Plus className="h-4 w-4" />
              Deploy New Game Server
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {servers.map((s) => (
            <ServerCard
              key={s.id}
              server={s}
              gameName={games.find((g) => g.id === s.gameId)?.name ?? s.gameId}
              onAct={(a) => act(s.id, a)}
              onDelete={() => del(s.id)}
              hostOnline={host.effectiveStatus === "online"}
            />
          ))}
        </div>
      )}

      <DeployDialog
        open={deployOpen}
        onOpenChange={setDeployOpen}
        hostId={host.id}
        games={games}
        onDeployed={() => {
          load();
          setDeployOpen(false);
        }}
      />
    </div>
  );
}

function ServerCard({
  server,
  gameName,
  onAct,
  onDelete,
  hostOnline,
}: {
  server: GameServer;
  gameName: string;
  onAct: (a: "start" | "stop" | "restart") => void;
  onDelete: () => void;
  hostOnline: boolean;
}) {
  const status = server.status;
  const badge =
    status === "running"
      ? "success"
      : status === "crashed" || status === "error"
        ? "destructive"
        : status === "installing" || status === "queued"
          ? "warning"
          : "secondary";
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Gamepad2 className="h-4 w-4" />
              </div>
              <div>
                <div className="font-semibold">{server.name}</div>
                <div className="text-xs text-muted-foreground">{gameName}</div>
              </div>
            </div>
          </div>
          <Badge variant={badge as never}>{status}</Badge>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">Port</div>
            <div className="font-mono">{server.port}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Players</div>
            <div className="font-mono">
              {server.playersOnline}/{server.maxPlayers}
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAct("start")}
            disabled={!hostOnline || status === "running" || status === "installing"}
          >
            <Play className="h-3.5 w-3.5" />
            Start
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAct("stop")}
            disabled={!hostOnline || status !== "running"}
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAct("restart")}
            disabled={!hostOnline || status === "installing"}
          >
            <RotateCw className="h-3.5 w-3.5" />
            Restart
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DeployDialog({
  open,
  onOpenChange,
  hostId,
  games,
  onDeployed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hostId: string;
  games: Game[];
  onDeployed: () => void;
}) {
  const [gameId, setGameId] = useState(games[0]?.id ?? "");
  const [name, setName] = useState("");
  const [port, setPort] = useState<string>(String(games[0]?.defaultPort ?? 27015));
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const g = games.find((x) => x.id === gameId);
    if (g) {
      if (!name) setName(`${g.name} Server`);
      setPort(String(g.defaultPort));
    }
  }, [gameId, games, name]);

  useEffect(() => {
    if (open && !name) {
      const g = games.find((x) => x.id === gameId);
      if (g) setName(`${g.name} Server`);
    }
  }, [open, gameId, games, name]);

  async function submit() {
    setDeploying(true);
    setError(null);
    const res = await fetch(`/api/hosts/${hostId}/game-servers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId, name, port: Number(port) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Deploy failed.");
      setDeploying(false);
      return;
    }
    setDeploying(false);
    setName("");
    onDeployed();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deploy a game server</DialogTitle>
          <DialogDescription>
            The agent will download and install the game files via SteamCMD,
            then start the server.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Game</Label>
            <Select value={gameId} onValueChange={setGameId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a game" />
              </SelectTrigger>
              <SelectContent>
                {games.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Server name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Valheim Server"
            />
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            <Input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              min={1}
              max={65535}
            />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={deploying || !gameId || !name}>
            {deploying && <Loader2 className="h-4 w-4 animate-spin" />}
            Deploy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
