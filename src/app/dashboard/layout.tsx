import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { hosts } from "@/db/schema";
import { HxSidebar } from "@/components/hex/shell/sidebar";
import { HxTopBar } from "@/components/hex/shell/top-bar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [{ total: hostCount } = { total: 0 }] = await db
    .select({ total: count() })
    .from(hosts)
    .where(eq(hosts.userId, user.id));

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hx-app-bg)" }}>
      <HxSidebar
        user={{ name: user.name, email: user.email }}
        counts={{ hosts: hostCount ?? 0 }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <HxTopBar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
