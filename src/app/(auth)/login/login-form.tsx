"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HxButton } from "@/components/hex/button";

const field = {
  className: "h-10 w-full rounded-lg border px-3 text-[13.5px] outline-none",
  style: {
    background: "var(--hx-bg)",
    borderColor: "var(--hx-border)",
    color: "var(--hx-fg)",
  } as React.CSSProperties,
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong.");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Couldn't connect to the server.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="hx-mono-tag text-[var(--hx-muted-fg)]">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          {...field}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="hx-mono-tag text-[var(--hx-muted-fg)]">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          {...field}
        />
      </label>
      {error && (
        <div
          className="rounded-lg border px-3 py-2 text-[12.5px]"
          style={{
            background:
              "color-mix(in oklch, var(--hx-err) 10%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--hx-err) 30%, transparent)",
            color: "var(--hx-err)",
          }}
        >
          {error}
        </div>
      )}
      <HxButton type="submit" variant="primary" size="lg" disabled={loading}>
        {loading ? "Signing in…" : "Log in"}
      </HxButton>
    </form>
  );
}
