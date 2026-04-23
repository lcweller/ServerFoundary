"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HxIcon, type HxIconName } from "../icons";
import { HexWordmark } from "../logo";
import { cn } from "@/lib/utils";

type Item = {
  href: string;
  label: string;
  icon: HxIconName;
  count?: number | null;
  match?: (pathname: string) => boolean;
};

const primary: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  {
    href: "/dashboard/hosts",
    label: "Hosts",
    icon: "hosts",
    match: (p) => p.startsWith("/dashboard/hosts"),
  },
  {
    href: "/dashboard/catalog",
    label: "Games",
    icon: "servers",
    match: (p) => p.startsWith("/dashboard/catalog"),
  },
  { href: "/dashboard/hosts/new", label: "Add host", icon: "deploy" },
];

const bottom: Item[] = [{ href: "/dashboard/settings", label: "Settings", icon: "settings" }];

export function HxSidebar({
  user,
  counts,
}: {
  user: { name: string; email: string };
  counts?: { hosts?: number; servers?: number };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const initials =
    user.name
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const withCount = primary.map((i) =>
    i.label === "Hosts"
      ? { ...i, count: counts?.hosts ?? null }
      : i.label === "Games"
        ? { ...i, count: null }
        : i,
  );

  return (
    <aside
      className="sticky top-0 hidden h-screen w-[var(--hx-sidebar-w)] shrink-0 flex-col gap-[14px] border-r px-2.5 pb-3.5 pt-3.5 md:flex"
      style={{
        background: "var(--hx-surface-sunken)",
        borderColor: "var(--hx-border)",
      }}
    >
      <div className="px-1.5 pt-1">
        <HexWordmark size={16} />
      </div>

      <nav className="flex flex-col gap-0.5">
        {withCount.map((i) => (
          <NavItem key={i.href} item={i} active={isActive(pathname, i)} />
        ))}
      </nav>

      <div
        className="mx-2 h-px"
        style={{ background: "var(--hx-border)" }}
      />

      <div className="flex-1" />

      <nav className="flex flex-col gap-0.5">
        {bottom.map((i) => (
          <NavItem key={i.href} item={i} active={isActive(pathname, i)} />
        ))}
      </nav>

      <button
        onClick={logout}
        className="flex w-full items-center gap-2.5 border-t pb-0.5 pt-2 text-left"
        style={{ borderColor: "var(--hx-border)" }}
      >
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{
            background:
              "linear-gradient(135deg, var(--hx-accent), var(--hx-accent-2))",
          }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-medium">{user.name}</div>
          <div className="truncate text-[11px] text-[var(--hx-muted-fg)]">
            {user.email}
          </div>
        </div>
        <span className="text-[var(--hx-muted-fg)]">
          <HxIcon.logout size={14} />
        </span>
      </button>
    </aside>
  );
}

function isActive(pathname: string, item: Item): boolean {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function NavItem({ item, active }: { item: Item; active: boolean }) {
  const Icon = HxIcon[item.icon];
  return (
    <Link
      href={item.href}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13.5px] font-medium leading-none transition-colors",
        active
          ? "text-[var(--hx-fg)]"
          : "text-[var(--hx-muted-fg)] hover:bg-[var(--hx-chip)]",
      )}
      style={
        active
          ? { background: "var(--hx-chip)" }
          : undefined
      }
    >
      <Icon size={15} />
      <span className="flex-1">{item.label}</span>
      {item.count != null && (
        <span
          className="rounded px-1.5 py-[1px] font-mono text-[11px]"
          style={{
            background: "var(--hx-chip-strong)",
            color: "var(--hx-muted-fg)",
          }}
        >
          {item.count}
        </span>
      )}
    </Link>
  );
}
