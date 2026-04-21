"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, RotateCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreatedHost = {
  hostId: string;
  token: string;
  command: string;
};

export function AddHostFlow({ baseUrl }: { baseUrl: string }) {
  const [name, setName] = useState("My Game Server");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedHost | null>(null);

  const effectiveBase =
    baseUrl && baseUrl.length > 0
      ? baseUrl
      : typeof window !== "undefined"
        ? window.location.origin
        : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/hosts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't create host.");
        setCreating(false);
        return;
      }
      const data = await res.json();
      const command = `curl -fsSL ${effectiveBase}/install.sh | sudo bash -s -- ${effectiveBase} ${data.enrollmentToken}`;
      setCreated({
        hostId: data.host.id,
        token: data.enrollmentToken,
        command,
      });
      setCreating(false);
    } catch {
      setError("Couldn't reach the server.");
      setCreating(false);
    }
  }

  if (created) {
    return (
      <InstallStep
        hostId={created.hostId}
        command={created.command}
        onRegenerate={async () => {
          setCreated(null);
          setError(null);
        }}
      />
    );
  }

  return (
    <Card className="max-w-2xl">
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="host-name">Host name</Label>
            <Input
              id="host-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Game Server"
              disabled={creating}
              required
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              Just a label so you can tell your hosts apart. You can change it later.
            </p>
          </div>
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" disabled={creating}>
            {creating && <Loader2 className="h-4 w-4 animate-spin" />}
            Create host
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function InstallStep({
  hostId,
  command,
  onRegenerate,
}: {
  hostId: string;
  command: string;
  onRegenerate: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"waiting" | "connected" | "expired">(
    "waiting",
  );

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/hosts/${hostId}/status`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "online") {
            setStatus("connected");
            return;
          }
          if (data.enrolled) {
            setStatus("connected");
            return;
          }
        }
      } catch {}
      attempts++;
      if (attempts > 720) {
        setStatus("expired");
        return;
      }
      setTimeout(poll, 3000);
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [hostId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs text-primary">
              1
            </div>
            Run this on your Linux server
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Open a terminal on the server you want to link. Paste this command
            and press Enter. The installer will set up everything automatically.
          </p>
          <div className="relative">
            <pre className="scrollbar-thin overflow-x-auto rounded-md border border-border bg-secondary/40 p-4 pr-14 text-xs">
              <code>{command}</code>
            </pre>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="absolute right-2 top-2"
              onClick={copy}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            This link expires in 1 hour. You can regenerate it if needed.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-4">
            <div
              className={
                status === "connected"
                  ? "flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success"
                  : status === "expired"
                    ? "flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15 text-destructive"
                    : "flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"
              }
            >
              {status === "connected" ? (
                <Check className="h-5 w-5" />
              ) : status === "expired" ? (
                <RotateCw className="h-5 w-5" />
              ) : (
                <Server className="h-5 w-5 animate-pulse-dot" />
              )}
            </div>
            <div>
              <div className="font-medium">
                {status === "connected"
                  ? "Connected!"
                  : status === "expired"
                    ? "This link has expired"
                    : "Waiting for your server to connect..."}
              </div>
              <div className="text-xs text-muted-foreground">
                {status === "connected"
                  ? "Your host has checked in successfully."
                  : status === "expired"
                    ? "Generate a new one to try again."
                    : "This can take a few minutes the first time."}
              </div>
            </div>
          </div>
          {status === "connected" ? (
            <Button onClick={() => router.push(`/dashboard/hosts/${hostId}`)}>
              Go to Host
            </Button>
          ) : status === "expired" ? (
            <Button variant="outline" onClick={onRegenerate}>
              <RotateCw className="h-4 w-4" />
              Regenerate
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
