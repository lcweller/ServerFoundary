"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HxCard } from "@/components/hex/card";
import { HxButton } from "@/components/hex/button";
import { HxBadge } from "@/components/hex/badge";
import { HxIcon } from "@/components/hex/icons";

type CreatedHost = {
  hostId: string;
  token: string;
  command: string;
};

export function AddHostFlow({ baseUrl }: { baseUrl: string }) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState("My game server");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedHost | null>(null);

  const effectiveBase =
    baseUrl && baseUrl.length > 0
      ? baseUrl
      : typeof window !== "undefined"
        ? window.location.origin
        : "";

  async function createHost() {
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
      setStep(1);
      setCreating(false);
    } catch {
      setError("Couldn't reach the server.");
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <Stepper step={step} />

      {step === 0 && (
        <HxCard padding={28}>
          <div className="mb-1 text-[15px] font-medium">Name this host</div>
          <div className="mb-5 text-[13px] text-[var(--hx-muted-fg)]">
            Just a label so you can tell your hosts apart later. You can change
            it any time.
          </div>
          <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <MethodCard
              iconName="terminal"
              title="Existing Linux box"
              desc="Paste a one-liner on Debian, Ubuntu, or any systemd host. Installs the gameserveros-agent in place."
              badges={["Debian 12", "Ubuntu 22.04+"]}
              selected
            />
            <MethodCard
              iconName="download"
              title="Fresh install — GameServerOS"
              desc="Coming soon. A hybrid ISO that auto-pairs on first boot."
              badges={["Soon"]}
              disabled
            />
          </div>

          <div className="mb-6">
            <div className="mb-1.5 hx-mono-tag text-[var(--hx-muted-fg)]">
              Host name
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My game server"
              className="h-10 w-full rounded-lg border px-3 text-[13.5px]"
              style={{
                background: "var(--hx-bg)",
                borderColor: "var(--hx-border)",
                color: "var(--hx-fg)",
              }}
            />
          </div>

          {error && (
            <div
              className="mb-4 rounded-lg border px-3 py-2 text-[12.5px]"
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

          <div className="flex justify-end">
            <HxButton
              variant="primary"
              iconRight="arrowRight"
              onClick={createHost}
              disabled={creating || !name.trim()}
            >
              Generate pair code
            </HxButton>
          </div>
        </HxCard>
      )}

      {step === 1 && created && (
        <CommandStep
          command={created.command}
          hostId={created.hostId}
          onBack={() => {
            setStep(0);
            setCreated(null);
          }}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && created && <WaitingStep hostId={created.hostId} />}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Choose host", "Pair code", "Waiting"];
  return (
    <div className="flex gap-4">
      {labels.map((l, i) => (
        <div key={i} className="flex flex-1 items-center gap-2.5">
          <div
            className="flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold"
            style={{
              width: 22,
              height: 22,
              background:
                i < step
                  ? "var(--hx-fg)"
                  : i === step
                    ? "var(--hx-accent)"
                    : "var(--hx-chip)",
              color:
                i === step
                  ? "#0a1a10"
                  : i < step
                    ? "var(--hx-bg)"
                    : "var(--hx-muted-fg)",
            }}
          >
            {i < step ? <HxIcon.check size={12} /> : i + 1}
          </div>
          <div
            className="text-[12.5px]"
            style={{
              color: i <= step ? "var(--hx-fg)" : "var(--hx-muted-fg)",
              fontWeight: i === step ? 500 : 400,
            }}
          >
            {l}
          </div>
          {i < labels.length - 1 && (
            <div
              className="h-px flex-1"
              style={{ background: "var(--hx-border)" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function MethodCard({
  iconName,
  title,
  desc,
  badges,
  selected,
  disabled,
}: {
  iconName: keyof typeof HxIcon;
  title: string;
  desc: string;
  badges: string[];
  selected?: boolean;
  disabled?: boolean;
}) {
  const Icon = HxIcon[iconName];
  return (
    <div
      className="rounded-xl border p-5"
      style={{
        background: "var(--hx-bg)",
        borderColor: selected ? "var(--hx-fg)" : "var(--hx-border)",
        borderWidth: selected ? 1.5 : 1,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div
        className="mb-3.5 flex h-[34px] w-[34px] items-center justify-center rounded-lg"
        style={{ background: "var(--hx-chip)" }}
      >
        <Icon size={18} />
      </div>
      <div className="mb-1.5 text-[14px] font-medium">{title}</div>
      <div className="mb-3 text-[12.5px] leading-[1.5] text-[var(--hx-muted-fg)]">
        {desc}
      </div>
      <div className="flex gap-1.5">
        {badges.map((b) => (
          <HxBadge key={b} size="sm">
            {b}
          </HxBadge>
        ))}
      </div>
    </div>
  );
}

function CommandStep({
  command,
  hostId,
  onBack,
  onContinue,
}: {
  command: string;
  hostId: string;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Derive a cosmetic 8-char pair code from the token in the command so it
  // looks like Hexmesh's pairing block. (The token itself stays in the
  // command for functional correctness.)
  const token = command.split(" ").slice(-1)[0] ?? "";
  const cellChars = token
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8)
    .padEnd(8, "0");
  void hostId;

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <HxCard padding={28}>
      <div className="mb-1 text-[15px] font-medium">Your pairing code</div>
      <div className="mb-6 text-[13px] text-[var(--hx-muted-fg)]">
        Single-use, expires in 1 hour. Rotate any time by regenerating.
      </div>

      <div className="mb-7 flex items-center justify-center gap-2.5">
        {cellChars
          .slice(0, 4)
          .split("")
          .map((ch, i) => (
            <CodeCell key={`a${i}`} ch={ch} />
          ))}
        <div
          className="self-center font-mono text-[24px]"
          style={{ color: "var(--hx-border-strong)" }}
        >
          −
        </div>
        {cellChars
          .slice(4, 8)
          .split("")
          .map((ch, i) => (
            <CodeCell key={`b${i}`} ch={ch} />
          ))}
      </div>

      <div>
        <div className="mb-2 hx-mono-tag text-[var(--hx-muted-fg)]">
          Run on the host
        </div>
        <div
          className="flex items-start gap-2.5 rounded-xl p-4 font-mono text-[13px] leading-[1.6]"
          style={{ background: "var(--hx-fg)", color: "var(--hx-bg)" }}
        >
          <span className="shrink-0" style={{ color: "var(--hx-accent)" }}>
            $
          </span>
          <div className="flex-1 break-all">{command}</div>
          <button
            onClick={copy}
            className="flex shrink-0 items-center gap-1 rounded border px-2 py-1 font-sans text-[11px]"
            style={{
              background: "color-mix(in oklch, var(--hx-bg) 10%, transparent)",
              borderColor:
                "color-mix(in oklch, var(--hx-bg) 15%, transparent)",
              color: "var(--hx-bg)",
            }}
          >
            {copied ? <HxIcon.check size={11} /> : <HxIcon.copy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="mt-6 flex justify-between">
        <HxButton variant="ghost" icon="arrowLeft" onClick={onBack}>
          Back
        </HxButton>
        <HxButton variant="primary" iconRight="arrowRight" onClick={onContinue}>
          I&apos;ve run the command
        </HxButton>
      </div>
    </HxCard>
  );
}

function CodeCell({ ch }: { ch: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-[10px] border font-mono"
      style={{
        width: 52,
        height: 64,
        background: "var(--hx-bg)",
        borderColor: "var(--hx-border)",
        fontSize: 32,
        fontWeight: 500,
        letterSpacing: "-0.02em",
        color: "var(--hx-fg)",
      }}
    >
      {ch}
    </div>
  );
}

function WaitingStep({ hostId }: { hostId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"waiting" | "connected">("waiting");
  const [progress, setProgress] = useState<0 | 1 | 2 | 3 | 4>(0);

  useEffect(() => {
    let cancelled = false;
    let stage: typeof progress = 0;
    const stageTimer = setInterval(() => {
      if (stage < 3) {
        stage = (stage + 1) as typeof progress;
        setProgress(stage);
      }
    }, 1200);

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/hosts/${hostId}/status`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === "online" || data.enrolled) {
            setProgress(4);
            setStatus("connected");
            clearInterval(stageTimer);
            return;
          }
        }
      } catch {}
      setTimeout(poll, 2500);
    }
    poll();
    return () => {
      cancelled = true;
      clearInterval(stageTimer);
    };
  }, [hostId]);

  const stages = [
    "Fetching installer",
    "Installing dependencies",
    "Enrolling agent",
    "Trusting host fingerprint",
    "Host fingerprint trusted",
  ];

  if (status === "connected") {
    return (
      <HxCard padding={36}>
        <div className="text-center">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background:
                "color-mix(in oklch, var(--hx-accent) 15%, transparent)",
              color: "var(--hx-accent-fg)",
            }}
          >
            <HxIcon.check size={30} />
          </div>
          <div
            className="text-[22px] font-medium"
            style={{ letterSpacing: "-0.02em" }}
          >
            Host online.
          </div>
          <div className="mt-1.5 text-[14px] text-[var(--hx-muted-fg)]">
            Your host is now paired with the mesh.
          </div>
        </div>
        <div className="mt-7 flex justify-end gap-2.5">
          <HxButton
            variant="secondary"
            onClick={() => router.push(`/dashboard/hosts/${hostId}`)}
          >
            View host
          </HxButton>
          <HxButton
            variant="primary"
            iconRight="arrowRight"
            onClick={() => router.push(`/dashboard/hosts/${hostId}`)}
          >
            Deploy a game server
          </HxButton>
        </div>
      </HxCard>
    );
  }

  return (
    <HxCard padding={36}>
      <div className="text-center">
        <div
          className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "var(--hx-chip)" }}
        >
          <div
            className="absolute animate-hx-spin rounded-[20px] border-2"
            style={{
              inset: -4,
              borderColor: "var(--hx-accent)",
              borderTopColor: "transparent",
            }}
          />
          <HxIcon.hosts size={26} />
        </div>
        <div
          className="text-[17px] font-medium"
          style={{ letterSpacing: "-0.01em" }}
        >
          Waiting for the host to check in…
        </div>
        <div className="mt-1.5 text-[13px] text-[var(--hx-muted-fg)]">
          Leave this window open while the installer runs on the target
          machine.
        </div>
      </div>
      <div
        className="mt-7 rounded-xl border p-5"
        style={{
          background: "var(--hx-surface-sunken)",
          borderColor: "var(--hx-border)",
        }}
      >
        <div className="flex flex-col gap-2.5">
          {stages.map((s, i) => {
            const done = progress > i;
            const active = progress === i;
            return (
              <div
                key={i}
                className="flex items-center gap-2.5 font-mono text-[13px]"
                style={{
                  color:
                    done || active
                      ? "var(--hx-fg)"
                      : "var(--hx-muted-fg)",
                }}
              >
                <span className="inline-flex w-3.5 justify-center">
                  {done ? (
                    <span style={{ color: "var(--hx-accent)" }}>
                      <HxIcon.check size={13} />
                    </span>
                  ) : active ? (
                    <span style={{ color: "var(--hx-accent-2)" }}>●</span>
                  ) : (
                    <span style={{ color: "var(--hx-border-strong)" }}>○</span>
                  )}
                </span>
                → {s}
              </div>
            );
          })}
        </div>
      </div>
    </HxCard>
  );
}
