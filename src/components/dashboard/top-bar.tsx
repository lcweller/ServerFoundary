"use client";

import { usePathname } from "next/navigation";

function titleFor(pathname: string): string {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname.startsWith("/dashboard/hosts")) return "Hosts";
  if (pathname.startsWith("/dashboard/catalog")) return "Game Catalog";
  if (pathname.startsWith("/dashboard/settings")) return "Settings";
  return "Dashboard";
}

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
      <h2 className="text-sm font-medium text-muted-foreground">
        {titleFor(pathname)}
      </h2>
    </header>
  );
}
