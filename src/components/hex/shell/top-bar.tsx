"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HxIcon } from "../icons";
import { HxKbd } from "../kbd";
import { HxNotificationsBell } from "../notifications-bell";

type Crumb = { label: string; href?: string };

function crumbsFor(pathname: string): Crumb[] {
  if (pathname === "/dashboard") return [{ label: "Dashboard" }];
  if (pathname === "/dashboard/hosts") return [{ label: "Hosts" }];
  if (pathname === "/dashboard/hosts/new")
    return [
      { label: "Hosts", href: "/dashboard/hosts" },
      { label: "Add host" },
    ];
  if (pathname.startsWith("/dashboard/hosts/"))
    return [
      { label: "Hosts", href: "/dashboard/hosts" },
      { label: "Detail" },
    ];
  if (pathname === "/dashboard/catalog") return [{ label: "Games" }];
  if (pathname === "/dashboard/settings") return [{ label: "Settings" }];
  return [{ label: "Dashboard" }];
}

export function HxTopBar({
  onOpenSearch,
}: {
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);
  return (
    <header
      className="sticky top-0 z-20 flex h-[52px] items-center gap-3.5 border-b px-[22px]"
      style={{
        background: "var(--hx-bg)",
        borderColor: "var(--hx-border)",
        backdropFilter: "saturate(180%) blur(8px)",
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {c.href ? (
              <Link
                href={c.href}
                className="rounded px-1.5 py-1 text-[13.5px] text-[var(--hx-muted-fg)] hover:text-[var(--hx-fg)]"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className="px-1.5 py-1 text-[13.5px] font-medium text-[var(--hx-fg)]"
                style={{ letterSpacing: "-0.005em" }}
              >
                {c.label}
              </span>
            )}
            {i < crumbs.length - 1 && (
              <span
                className="text-xs"
                style={{ color: "var(--hx-border-strong)" }}
              >
                /
              </span>
            )}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={onOpenSearch}
        disabled={!onOpenSearch}
        className="flex h-8 min-w-[220px] items-center gap-2 rounded-lg border px-2.5 text-[12.5px] text-[var(--hx-muted-fg)] disabled:opacity-60"
        style={{
          background: "var(--hx-chip)",
          borderColor: "var(--hx-border)",
        }}
      >
        <HxIcon.search size={14} />
        <span className="flex-1 text-left">Search or command…</span>
        <HxKbd>⌘K</HxKbd>
      </button>

      <HxNotificationsBell />

      <Link
        href="/dashboard/hosts/new"
        className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-[13.5px] font-medium leading-none"
        style={{
          background: "var(--hx-fg)",
          color: "var(--hx-bg)",
          borderColor: "var(--hx-fg)",
        }}
      >
        <HxIcon.plus size={14} />
        Add host
      </Link>
    </header>
  );
}
