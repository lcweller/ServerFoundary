"use client";

import { useState } from "react";
import { HxIcon } from "@/components/hex/icons";

/**
 * Minimal email-capture form for the public landing. Submits to
 * POST /api/waitlist. Dedupes on unique email, silently succeeds on
 * re-submit so we don't leak whether an email is already on the list.
 */
export function WaitlistForm({ source = "landing" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }
      setStatus("ok");
      setEmail("");
    } catch {
      setError("Couldn't reach the server.");
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div
        className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-[13.5px]"
        style={{
          background:
            "color-mix(in oklch, var(--hx-accent) 10%, transparent)",
          borderColor:
            "color-mix(in oklch, var(--hx-accent) 30%, transparent)",
          color: "var(--hx-accent-fg)",
        }}
      >
        <HxIcon.check size={14} />
        You&apos;re on the list — we&apos;ll be in touch.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <label className="flex w-full flex-col gap-1 sm:max-w-xs">
        <span className="sr-only">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          className="h-10 w-full rounded-lg border px-3 text-[14px] outline-none focus:ring-1"
          style={{
            background: "var(--hx-bg)",
            borderColor: "var(--hx-border)",
            color: "var(--hx-fg)",
          }}
        />
        {error && (
          <span className="text-[12px]" style={{ color: "var(--hx-err)" }}>
            {error}
          </span>
        )}
      </label>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border px-4 text-[14px] font-medium disabled:opacity-60"
        style={{
          background: "var(--hx-fg)",
          borderColor: "var(--hx-fg)",
          color: "var(--hx-bg)",
        }}
      >
        {status === "submitting" ? "Joining…" : "Join the waitlist"}
        <HxIcon.arrowRight size={14} />
      </button>
    </form>
  );
}
