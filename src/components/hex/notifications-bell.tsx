"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Notification } from "@/db/schema";
import { HxIcon } from "./icons";
import { relativeTime } from "@/lib/format";

function colorForSeverity(severity: string): string {
  if (severity === "err") return "var(--hx-err)";
  if (severity === "warn") return "var(--hx-warn)";
  return "var(--hx-accent)";
}

export function HxNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const popRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          notifications: Notification[];
          unread: number;
        };
        setItems(data.notifications ?? []);
        setUnread(data.unread ?? 0);
      }
    } catch {}
  }, []);

  // Poll every 15s. Cheap given the user table FK and pagination cap.
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  // Click-outside close.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (btnRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // When the panel opens, mark everything currently shown as read so the
  // badge clears. Individual items can still be dismissed by clicking ×.
  useEffect(() => {
    if (!open || unread === 0) return;
    void fetch("/api/notifications/read-all", { method: "POST" });
    setUnread(0);
  }, [open, unread]);

  async function dismiss(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    load();
  }

  async function dismissAll() {
    setItems([]);
    await fetch("/api/notifications/dismiss-all", { method: "POST" });
    load();
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        className="relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border"
        style={{
          background: "var(--hx-chip)",
          borderColor: "var(--hx-border)",
          color: "var(--hx-fg)",
        }}
      >
        <HxIcon.bell size={16} />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 inline-flex min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[10px] font-medium"
            style={{
              height: 16,
              background: "var(--hx-err)",
              color: "white",
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={popRef}
          className="absolute right-0 top-[44px] z-30 w-[360px] overflow-hidden rounded-xl border shadow-2xl"
          style={{
            background: "var(--hx-bg)",
            borderColor: "var(--hx-border)",
          }}
        >
          <div
            className="flex items-center justify-between border-b px-3.5 py-2.5"
            style={{ borderColor: "var(--hx-border)" }}
          >
            <div className="text-[13px] font-medium">Notifications</div>
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={dismissAll}
                  className="text-[11.5px] text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
                >
                  Clear all
                </button>
              )}
              <Link
                href="/dashboard/notifications"
                onClick={() => setOpen(false)}
                className="text-[11.5px] text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
              >
                History
              </Link>
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12.5px] text-[var(--hx-muted-fg)]">
              You&apos;re all caught up.
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {items.map((n) => {
                const ago = Math.max(
                  0,
                  Math.floor(
                    (Date.now() - new Date(n.createdAt).getTime()) / 1000,
                  ),
                );
                const href = n.hostId
                  ? `/dashboard/hosts/${n.hostId}`
                  : null;
                const Inner = (
                  <div
                    className="grid items-start gap-2.5 px-3.5 py-2.5"
                    style={{ gridTemplateColumns: "8px 1fr 16px" }}
                  >
                    <span
                      className="mt-1 h-1.5 w-1.5 rounded-full"
                      style={{ background: colorForSeverity(n.severity) }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-[12.5px] font-medium">
                          {n.title}
                        </div>
                      </div>
                      {n.body && (
                        <div className="mt-0.5 truncate text-[11.5px] text-[var(--hx-muted-fg)]">
                          {n.body}
                        </div>
                      )}
                      <div className="mt-1 font-mono text-[10.5px] text-[var(--hx-muted-fg)]">
                        {n.kind} · {relativeTime(ago)}
                        {!n.readAt && (
                          <span
                            className="ml-1.5 inline-block rounded px-1 text-[10px]"
                            style={{
                              background:
                                "color-mix(in oklch, var(--hx-accent) 18%, transparent)",
                              color: "var(--hx-accent-fg)",
                            }}
                          >
                            new
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void dismiss(n.id);
                      }}
                      className="text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
                      aria-label="Dismiss"
                    >
                      <HxIcon.x size={12} />
                    </button>
                  </div>
                );
                return (
                  <div
                    key={n.id}
                    className="border-t hover:bg-[var(--hx-chip)]"
                    style={{ borderColor: "var(--hx-border)" }}
                  >
                    {href ? (
                      <Link href={href} onClick={() => setOpen(false)}>
                        {Inner}
                      </Link>
                    ) : (
                      Inner
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
