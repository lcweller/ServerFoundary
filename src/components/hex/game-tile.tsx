/**
 * Stylized placeholder game tile — colored square with a mono glyph and a
 * subtle repeating stripe pattern. Since we don't ship per-game artwork,
 * this gives the list visual identity without pulling assets at runtime.
 */
const palette: Record<string, { color: string; icon: string }> = {
  valheim: { color: "#3a5a7a", icon: "V" },
  minecraft_java: { color: "#4a7d3c", icon: "M" },
  minecraft: { color: "#4a7d3c", icon: "M" },
  csgo: { color: "#b8722c", icon: "C" },
  cs2: { color: "#b8722c", icon: "C" },
  rust: { color: "#a34a2a", icon: "R" },
  ark: { color: "#5d7a4a", icon: "A" },
  terraria: { color: "#6a8a4a", icon: "T" },
  project_zomboid: { color: "#3e3e3e", icon: "Z" },
  zomboid: { color: "#3e3e3e", icon: "Z" },
  seven_days_to_die: { color: "#6a4a2a", icon: "7" },
  sevendays: { color: "#6a4a2a", icon: "7" },
};

export function HxGameTile({
  gameId,
  size = 64,
  className,
}: {
  gameId: string;
  size?: number;
  className?: string;
}) {
  const p =
    palette[gameId] ??
    ({ color: "#3a3a3a", icon: gameId[0]?.toUpperCase() ?? "?" } as const);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(6, size * 0.16),
        flexShrink: 0,
        background: p.color,
        backgroundImage:
          "repeating-linear-gradient(135deg, transparent 0 6px, rgba(255,255,255,0.04) 6px 7px)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontWeight: 600,
        fontSize: size * 0.42,
        letterSpacing: "-0.04em",
        position: "relative",
        boxShadow:
          "inset 0 -1px 0 rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
      }}
    >
      <span style={{ position: "relative", zIndex: 1 }}>{p.icon}</span>
      <div
        style={{
          position: "absolute",
          inset: 4,
          borderRadius: Math.max(4, size * 0.11),
          border: "1px solid rgba(255,255,255,0.08)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
