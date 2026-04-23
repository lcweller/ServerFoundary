import { cn } from "@/lib/utils";

type Tone = "neutral" | "ok" | "warn" | "err" | "accent" | "violet";

const toneClasses: Record<Tone, { bg: string; fg: string }> = {
  neutral: {
    bg: "bg-[var(--hx-chip)]",
    fg: "text-[var(--hx-muted-fg)]",
  },
  ok: {
    bg: "bg-[color-mix(in_oklch,var(--hx-ok)_12%,transparent)]",
    fg: "text-[var(--hx-ok-fg)]",
  },
  warn: {
    bg: "bg-[color-mix(in_oklch,var(--hx-warn)_18%,transparent)]",
    fg: "text-[var(--hx-warn-fg)]",
  },
  err: {
    bg: "bg-[color-mix(in_oklch,var(--hx-err)_15%,transparent)]",
    fg: "text-[var(--hx-err)]",
  },
  accent: {
    bg: "bg-[color-mix(in_oklch,var(--hx-accent)_15%,transparent)]",
    fg: "text-[var(--hx-accent-fg)]",
  },
  violet: {
    bg: "bg-[color-mix(in_oklch,var(--hx-accent-2)_15%,transparent)]",
    fg: "text-[var(--hx-accent-2)]",
  },
};

export function HxBadge({
  children,
  tone = "neutral",
  size = "md",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  size?: "sm" | "md";
  className?: string;
}) {
  const t = toneClasses[tone];
  const dims =
    size === "sm"
      ? "h-[18px] px-1.5 text-[11px]"
      : "h-[22px] px-2 text-[11.5px]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded font-mono font-medium uppercase tracking-normal",
        dims,
        t.bg,
        t.fg,
        className,
      )}
    >
      {children}
    </span>
  );
}
