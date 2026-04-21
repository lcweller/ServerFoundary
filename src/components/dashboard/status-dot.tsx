import { cn } from "@/lib/utils";

export function StatusDot({
  status,
  className,
}: {
  status: "online" | "offline" | "connecting" | string;
  className?: string;
}) {
  const color =
    status === "online"
      ? "bg-success"
      : status === "connecting"
        ? "bg-warning"
        : "bg-destructive";
  const pulse = status === "online" || status === "connecting";
  return (
    <span className={cn("relative flex h-2 w-2", className)}>
      {pulse && (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            color,
          )}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", color)} />
    </span>
  );
}

export function StatusBadge({
  status,
}: {
  status: "online" | "offline" | "connecting" | string;
}) {
  const label =
    status === "online"
      ? "Online"
      : status === "connecting"
        ? "Connecting"
        : "Offline";
  const color =
    status === "online"
      ? "border-success/30 bg-success/10 text-success"
      : status === "connecting"
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-destructive/30 bg-destructive/10 text-destructive";
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        color,
      )}
    >
      <StatusDot status={status} />
      {label}
    </div>
  );
}
