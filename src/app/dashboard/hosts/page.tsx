import Link from "next/link";
import { Plus, Server } from "lucide-react";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { HostCard } from "@/components/dashboard/host-card";
import { requireUser } from "@/lib/auth";
import { computeStatus } from "@/lib/hosts";
import { db } from "@/db";
import { hosts } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function HostsPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(hosts)
    .where(eq(hosts.userId, user.id))
    .orderBy(hosts.createdAt);

  const hostsWithStatus = rows.map((h) => ({
    ...h,
    effectiveStatus: computeStatus(h),
  }));

  return (
    <div>
      <PageHeader
        title="Hosts"
        description="All Linux servers linked to your account."
        actions={
          <Button asChild>
            <Link href="/dashboard/hosts/new">
              <Plus className="h-4 w-4" />
              Add Host
            </Link>
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Server className="h-5 w-5" />}
          title="No hosts linked yet"
          description="Run one command on your server to link it here."
          action={
            <Button asChild>
              <Link href="/dashboard/hosts/new">
                <Plus className="h-4 w-4" />
                Add Your First Host
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hostsWithStatus.map((h) => (
            <HostCard key={h.id} host={h} />
          ))}
        </div>
      )}
    </div>
  );
}
