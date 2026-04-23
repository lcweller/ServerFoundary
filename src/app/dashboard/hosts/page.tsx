import Link from "next/link";
import { eq } from "drizzle-orm";
import { PageContainer, PageHeader } from "@/components/hex/page";
import { HxCard } from "@/components/hex/card";
import { HxIcon } from "@/components/hex/icons";
import { requireUser } from "@/lib/auth";
import { computeStatus, type Metrics } from "@/lib/hosts";
import { db } from "@/db";
import { hosts, gameServers } from "@/db/schema";
import { HostsList } from "./hosts-list";

export const dynamic = "force-dynamic";

export default async function HostsPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(hosts)
    .where(eq(hosts.userId, user.id))
    .orderBy(hosts.createdAt);

  const serverRows = await db
    .select({ hostId: gameServers.hostId })
    .from(gameServers)
    .where(eq(gameServers.userId, user.id));

  const serversByHost = new Map<string, number>();
  for (const s of serverRows) {
    serversByHost.set(s.hostId, (serversByHost.get(s.hostId) ?? 0) + 1);
  }

  const withStatus = rows.map((h) => ({
    ...h,
    effectiveStatus: computeStatus(h),
    metrics: (h.metrics as Metrics | null) ?? null,
    serverCount: serversByHost.get(h.id) ?? 0,
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Hosts"
        subtitle={`${rows.length} ${rows.length === 1 ? "host" : "hosts"} linked to your account.`}
        actions={
          <Link
            href="/dashboard/hosts/new"
            className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-[13.5px] font-medium"
            style={{
              background: "var(--hx-fg)",
              borderColor: "var(--hx-fg)",
              color: "var(--hx-bg)",
            }}
          >
            <HxIcon.plus size={14} />
            Add host
          </Link>
        }
      />

      {rows.length === 0 ? (
        <HxCard className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--hx-muted-fg)]"
            style={{ background: "var(--hx-chip)" }}
          >
            <HxIcon.hosts size={22} />
          </div>
          <div className="text-[15px] font-medium">No hosts linked yet</div>
          <p className="max-w-sm text-[13px] text-[var(--hx-muted-fg)]">
            Run one command on any Debian- or Ubuntu-based Linux machine to
            enroll it as a host.
          </p>
          <Link
            href="/dashboard/hosts/new"
            className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-[13.5px] font-medium"
            style={{
              background: "var(--hx-fg)",
              borderColor: "var(--hx-fg)",
              color: "var(--hx-bg)",
            }}
          >
            <HxIcon.plus size={14} />
            Add your first host
          </Link>
        </HxCard>
      ) : (
        <HostsList hosts={withStatus} />
      )}
    </PageContainer>
  );
}
