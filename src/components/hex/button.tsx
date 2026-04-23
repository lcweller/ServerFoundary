"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { HxIcon, type HxIconName } from "./icons";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variantStyles: Record<Variant, string> = {
  primary:
    "border-[var(--hx-fg)] bg-[var(--hx-fg)] text-[var(--hx-bg)] hover:opacity-90",
  accent:
    "border-[var(--hx-accent)] bg-[var(--hx-accent)] text-[#0a1a10] hover:brightness-105",
  secondary:
    "border-[var(--hx-border)] bg-[var(--hx-bg)] text-[var(--hx-fg)] hover:bg-[var(--hx-chip)]",
  ghost:
    "border-transparent bg-transparent text-[var(--hx-fg)] hover:bg-[var(--hx-chip)]",
  danger:
    "border-[var(--hx-border)] bg-[var(--hx-bg)] text-[var(--hx-err)] hover:bg-[color-mix(in_oklch,var(--hx-err)_10%,var(--hx-bg))]",
};

const sizeStyles: Record<Size, { cls: string; icon: number }> = {
  sm: { cls: "h-7 px-2.5 text-[12.5px] gap-1.5", icon: 13 },
  md: { cls: "h-[34px] px-3 text-[13.5px] gap-1.5", icon: 14 },
  lg: { cls: "h-10 px-4 text-[14.5px] gap-2", icon: 16 },
};

export interface HxButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: HxIconName | React.ReactNode;
  iconRight?: HxIconName | React.ReactNode;
}

export const HxButton = React.forwardRef<HTMLButtonElement, HxButtonProps>(
  function HxButton(
    {
      variant = "secondary",
      size = "md",
      icon,
      iconRight,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const s = sizeStyles[size];
    const renderIcon = (v: HxIconName | React.ReactNode) => {
      if (!v) return null;
      if (typeof v === "string" && v in HxIcon) {
        const I = HxIcon[v as HxIconName];
        return <I size={s.icon} />;
      }
      return v;
    };
    return (
      <button
        ref={ref}
        {...rest}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg border font-sans font-medium leading-none tracking-[-0.005em] transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          s.cls,
          variantStyles[variant],
          className,
        )}
      >
        {renderIcon(icon)}
        {children}
        {renderIcon(iconRight)}
      </button>
    );
  },
);
