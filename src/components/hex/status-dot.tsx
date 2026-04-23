type Status = "online" | "offline" | "error" | "warn" | "pending" | string;

const colors: Record<string, string> = {
  online: "var(--hx-ok)",
  offline: "var(--hx-muted-fg)",
  connecting: "var(--hx-accent-2)",
  error: "var(--hx-err)",
  warn: "var(--hx-warn)",
  pending: "var(--hx-accent-2)",
};

export function StatusDot({
  status = "online",
  size = 8,
}: {
  status?: Status;
  size?: number;
}) {
  const color = colors[status] ?? "var(--hx-muted-fg)";
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow:
          status === "online"
            ? `0 0 0 3px color-mix(in oklch, ${color} 20%, transparent)`
            : "none",
      }}
    />
  );
}
