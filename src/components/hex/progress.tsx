export function HxProgress({
  value = 0,
  max = 100,
  color = "var(--hx-accent)",
  height = 4,
  className,
}: {
  value?: number;
  max?: number;
  color?: string;
  height?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={className}
      style={{
        height,
        background: "var(--hx-chip)",
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 999,
          transition: "width 600ms ease-out",
        }}
      />
    </div>
  );
}
