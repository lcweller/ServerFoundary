"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function BrowserTerminal({
  hostId,
  wsUrl,
  onClose,
}: {
  hostId: string;
  wsUrl: string;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "closed">(
    "connecting",
  );

  useEffect(() => {
    let terminal: import("xterm").Terminal | null = null;
    let fit: import("xterm-addon-fit").FitAddon | null = null;
    let ws: WebSocket | null = null;
    let disposed = false;

    async function init() {
      if (!containerRef.current) return;
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("xterm"),
        import("xterm-addon-fit"),
      ]);
      if (disposed) return;

      terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        theme: {
          background: "#09090b",
          foreground: "#e4e4e7",
          cursor: "#60a5fa",
        },
      });
      fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(containerRef.current);
      fit.fit();

      const onResize = () => fit?.fit();
      window.addEventListener("resize", onResize);

      const base = wsUrl
        ? wsUrl.replace(/\/$/, "")
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3001`;
      ws = new WebSocket(`${base}/api/v1/terminal/${hostId}`);

      ws.onopen = () => {
        setStatus("ready");
        const d = fit?.proposeDimensions();
        if (d && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: d.cols, rows: d.rows }));
        }
        ws?.send(JSON.stringify({ type: "start" }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "output") terminal?.write(msg.data);
          else if (msg.type === "closed") {
            setStatus("closed");
            terminal?.writeln("\r\n\x1b[33m[session ended]\x1b[0m");
          }
        } catch {}
      };
      ws.onclose = () => {
        setStatus("closed");
      };
      ws.onerror = () => {
        setStatus("closed");
      };

      terminal.onData((d) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data: d }));
        }
      });
      terminal.onResize((size) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }),
          );
        }
      });

      return () => {
        window.removeEventListener("resize", onResize);
      };
    }

    const cleanup = init();

    return () => {
      disposed = true;
      cleanup.then((fn) => fn?.());
      try {
        ws?.close();
      } catch {}
      terminal?.dispose();
    };
  }, [hostId, wsUrl]);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs">
          <span className="text-muted-foreground">
            {status === "connecting"
              ? "Connecting..."
              : status === "ready"
                ? "Connected"
                : "Disconnected"}
          </span>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
            Disconnect
          </Button>
        </div>
        <div
          ref={containerRef}
          className="h-[480px] w-full bg-[#09090b] p-2"
          style={{ minHeight: 480 }}
        />
      </CardContent>
    </Card>
  );
}
