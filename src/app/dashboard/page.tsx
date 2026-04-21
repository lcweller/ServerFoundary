import Link from "next/link";
import {
  Server,
  Gamepad2,
  Activity,
  Plus,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { count, eq, and } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { HostCard } from "@/components/dashboard/host-card";
import { requireUser } from "@/lib/auth";
import { computeStatus } from "@/lib/hosts";
import { db } from "@/db";
import { hosts, gameServers } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function DashboardHomePage() {
  const user = await requireUser();

  const userHosts = await db
    .select()
    .from(hosts)
    .where(eq(hosts.userId, user.id))
    .orderBy(hosts.createdAt);

  const [{ total: totalServers } = { total: 0 }] = await db
    .select({ total: count() })
    .from(gameServers)
    .where(eq(gameServers.userId, user.id));

  const [{ running: runningServers } = { running: 0 }] = await db
    .select({ running: count() })
    .from(gameServers)
    .where(
      and(eq(gameServers.userId, user.id), eq(gameServers.status, "running")),
    );

  const hostsWithStatus = userHosts.map((h) => ({
    ...h,
    effectiveStatus: computeStatus(h),
  }));

  const onlineHosts = hostsWithStatus.filter(
    (h) => h.effectiveStatus === "online",
  ).length;
  const issueHosts = hostsWithStatus.filter(
    (h) => h.effectiveStatus === "offline" && h.lastHeartbeatAt !== null,
  ).length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user.name}.`}
        actions={
          <Button asChild>
            <Link href="/dashboard/hosts/new">
              <Plus className="h-4 w-4" />
              Add Host
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <OverviewCard
          title="Hosts"
          icon={<Server className="h-4 w-4" />}
          primary={String(userHosts.length)}
          secondary={`${onlineHosts} online`}
        />
        <OverviewCard
          title="Game Servers"
          icon={<Gamepad2 className="h-4 w-4" />}
          primary={String(totalServers ?? 0)}
          secondary={`${runningServers ?? 0} running`}
        />
        <OverviewCard
          title="System Health"
          icon={<Activity className="h-4 w-4" />}
          primary={
            issueHosts === 0 ? (
              <span className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" />
                All good
              </span>
            ) : (
              <span className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                {issueHosts} {issueHosts === 1 ? "issue" : "issues"}
              </span>
            )
          }
          secondary={
            issueHosts === 0
              ? "Everything is healthy"
              : "Hosts are offline — check the hosts page"
          }
        />
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Your Hosts</h3>
        </div>

        {userHosts.length === 0 ? (
          <EmptyState
            icon={<Server className="h-5 w-5" />}
            title="No servers yet"
            description="Link your first Linux server to start hosting games."
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
            {hostsWithStatus.map((host) => (
              <HostCard key={host.id} host={host} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewCard({
  title,
  icon,
  primary,
  secondary,
}: {
  title: string;
  icon: React.ReactNode;
  primary: React.ReactNode;
  secondary: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{primary}</div>
        <p className="mt-1 text-xs text-muted-foreground">{secondary}</p>
      </CardContent>
    </Card>
  );
}
