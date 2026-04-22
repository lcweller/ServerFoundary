"use client";

import { useState } from "react";
import { Terminal as TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Host } from "@/db/schema";
import { BrowserTerminal } from "./browser-terminal";

export function TerminalTab({
  host,
  wsUrl,
}: {
  host: Host & { effectiveStatus: "online" | "offline" | "connecting" };
  wsUrl: string;
}) {
  const [open, setOpen] = useState(false);

  if (host.effectiveStatus !== "online") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <TerminalIcon className="h-5 w-5" />
          </div>
          <h3 className="font-semibold">Host is offline</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            The terminal is unavailable until the agent is back online.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-12">
          <Button size="lg" onClick={() => setOpen(true)}>
            <TerminalIcon className="h-4 w-4" />
            Open Terminal
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            A shell on your server, right here in the browser.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <BrowserTerminal
      hostId={host.id}
      wsUrl={wsUrl}
      onClose={() => setOpen(false)}
    />
  );
}
