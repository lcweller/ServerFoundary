export function HxKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-flex min-w-[18px] items-center justify-center rounded border px-1 font-mono leading-none"
      style={{
        height: 18,
        fontSize: 10.5,
        fontWeight: 500,
        background: "var(--hx-chip)",
        color: "var(--hx-muted-fg)",
        borderColor: "var(--hx-border)",
      }}
    >
      {children}
    </kbd>
  );
}
