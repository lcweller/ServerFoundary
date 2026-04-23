import Link from "next/link";
import { and, count, eq, sum, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { computeStatus, type Metrics } from "@/lib/hosts";
import { db } from "@/db";
import { hosts, gameServers } from "@/db/schema";
import { PageContainer, PageHeader } from "@/components/hex/page";
import { DashboardBody } from "./dashboard-body";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const user = await requireUser();

  const [userHosts, serverRows, aggregates] = await Promise.all([
    db
      .select()
      .from(hosts)
      .where(eq(hosts.userId, user.id))
      .orderBy(hosts.createdAt),
    db
      .select({
        id: gameServers.id,
        name: gameServers.name,
        gameId: gameServers.gameId,
        hostId: gameServers.hostId,
        status: gameServers.status,
        port: gameServers.port,
        playersOnline: gameServers.playersOnline,
        maxPlayers: gameServers.maxPlayers,
        updatedAt: gameServers.updatedAt,
      })
      .from(gameServers)
      .where(eq(gameServers.userId, user.id))
      .orderBy(sql`${gameServers.updatedAt} desc`),
    db
      .select({
        totalServers: count(),
        totalPlayers: sum(gameServers.playersOnline),
        totalSlots: sum(gameServers.maxPlayers),
      })
      .from(gameServers)
      .where(eq(gameServers.userId, user.id)),
  ]);

  const [{ running: runningServers } = { running: 0 }] = await db
    .select({ running: count() })
    .from(gameServers)
    .where(
      and(eq(gameServers.userId, user.id), eq(gameServers.status, "running")),
    );

  const hostsWithStatus = userHosts.map((h) => ({
    ...h,
    effectiveStatus: computeStatus(h),
    metrics: (h.metrics as Metrics | null) ?? null,
  }));

  const onlineHosts = hostsWithStatus.filter(
    (h) => h.effectiveStatus === "online",
  ).length;

  const totalServers = Number(aggregates[0]?.totalServers ?? 0);
  const totalPlayers = Number(aggregates[0]?.totalPlayers ?? 0);
  const totalSlots = Number(aggregates[0]?.totalSlots ?? 0);

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        subtitle={`${userHosts.length} ${userHosts.length === 1 ? "host" : "hosts"}, ${totalServers} game ${totalServers === 1 ? "server" : "servers"}, ${totalPlayers} ${totalPlayers === 1 ? "player" : "players"} online.`}
        actions={
          <>
            <Link
              href="/dashboard/hosts/new"
              className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-[13.5px] font-medium"
              style={{
                background: "var(--hx-bg)",
                borderColor: "var(--hx-border)",
                color: "var(--hx-fg)",
              }}
            >
              Add host
            </Link>
            <Link
              href="/dashboard/hosts/new"
              className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border px-3 text-[13.5px] font-medium"
              style={{
                background: "var(--hx-fg)",
                borderColor: "var(--hx-fg)",
                color: "var(--hx-bg)",
              }}
            >
              Deploy server
            </Link>
          </>
        }
      />

      <DashboardBody
        hosts={hostsWithStatus}
        servers={serverRows}
        totals={{
          hosts: userHosts.length,
          onlineHosts,
          servers: totalServers,
          runningServers: runningServers ?? 0,
          players: totalPlayers,
          slots: totalSlots,
        }}
      />
    </PageContainer>
  );
}
