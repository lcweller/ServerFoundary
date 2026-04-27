"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Host } from "@/db/schema";
import { HxCard } from "@/components/hex/card";
import { HxButton } from "@/components/hex/button";
import { HxBadge } from "@/components/hex/badge";
import { HxIcon } from "@/components/hex/icons";
import { StatusDot } from "@/components/hex/status-dot";
import { BrowserTerminal } from "./browser-terminal";

export function TerminalTab({
  host,
  wsUrl,
  onOpenSettings,
}: {
  host: Host & { effectiveStatus: "online" | "offline" | "connecting" };
  wsUrl: string;
  onOpenSettings?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  void router;

  if (host.effectiveStatus !== "online") {
    return (
      <HxCard className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--hx-muted-fg)]"
          style={{ background: "var(--hx-chip)" }}
        >
          <HxIcon.terminal size={20} />
        </div>
        <div className="text-[15px] font-medium">Host is offline</div>
        <p className="max-w-sm text-[13px] text-[var(--hx-muted-fg)]">
          The terminal is unavailable until the agent reconnects.
        </p>
      </HxCard>
    );
  }

  if (!host.terminalEnabled) {
    return (
      <HxCard className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{
            background:
              "color-mix(in oklch, var(--hx-warn) 12%, var(--hx-chip))",
            color: "var(--hx-warn-fg)",
          }}
        >
          <HxIcon.shield size={20} />
        </div>
        <div className="text-[15px] font-medium">Remote terminal is off</div>
        <p className="max-w-sm text-[13px] text-[var(--hx-muted-fg)]">
          Off by default. Turn it on from this host&apos;s Settings tab. Every
          session is logged with timestamp and source IP.
        </p>
        <HxButton
          variant="secondary"
          icon="settings"
          onClick={onOpenSettings}
        >
          Open Settings
        </HxButton>
      </HxCard>
    );
  }

  if (!open) {
    return (
      <HxCard className="flex flex-col items-center justify-center gap-4 px-6 py-14">
        <HxButton size="lg" variant="primary" icon="terminal" onClick={() => setOpen(true)}>
          Open terminal
        </HxButton>
        <p className="text-[12.5px] text-[var(--hx-muted-fg)]">
          A shell on your server, right here in the browser.
        </p>
      </HxCard>
    );
  }

  return (
    <HxCard padding={0} className="overflow-hidden">
      <div
        className="flex items-center gap-2 border-b px-3.5 py-2.5"
        style={{ borderColor: "var(--hx-border)" }}
      >
        <StatusDot status="online" size={6} />
        <div className="font-mono text-[12px]">
          gameserveros@{host.name}
        </div>
        <div className="flex-1" />
        <HxBadge size="sm">xterm.js</HxBadge>
        <HxButton
          size="sm"
          variant="secondary"
          icon="x"
          onClick={() => setOpen(false)}
        >
          Disconnect
        </HxButton>
      </div>
      <BrowserTerminal hostId={host.id} wsUrl={wsUrl} onClose={() => setOpen(false)} />
    </HxCard>
  );
}
