import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Hexmesh surface card. Default 20px padding; pass `padding={0}` for lists
 * where you want the inner rows to own their own padding.
 */
export function HxCard({
  className,
  padding = 20,
  style,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { padding?: number }) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-xl border bg-[var(--hx-surface)] text-[var(--hx-fg)]",
        className,
      )}
      style={{ padding, borderColor: "var(--hx-border)", ...style }}
    >
      {children}
    </div>
  );
}

export function HxCardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b px-[18px] py-[14px]",
        className,
      )}
      style={{ borderColor: "var(--hx-border)" }}
    >
      <div className="text-[13.5px] font-medium">{title}</div>
      {action}
    </div>
  );
}
