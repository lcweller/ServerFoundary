import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { computeStatus } from "@/lib/hosts";
import { db } from "@/db";
import { hosts, supportedGames } from "@/db/schema";
import { HostDetail } from "./host-detail";

export const dynamic = "force-dynamic";

export default async function HostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const [host] = await db
    .select()
    .from(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .limit(1);

  if (!host) notFound();

  const games = await db
    .select({
      id: supportedGames.id,
      name: supportedGames.name,
      defaultPort: supportedGames.defaultPort,
    })
    .from(supportedGames)
    .orderBy(supportedGames.name);

  // NEXT_PUBLIC_* env vars are inlined at build time, but the image is
  // built before the operator sets NEXT_PUBLIC_AGENT_WS_URL in Unraid. Read
  // it here on the server (where process.env is live at request time) and
  // pass it down as a prop so the browser terminal uses the correct URL.
  const wsUrl =
    process.env.NEXT_PUBLIC_AGENT_WS_URL ??
    process.env.AGENT_WS_URL ??
    "";

  return (
    <HostDetail
      initialHost={{ ...host, effectiveStatus: computeStatus(host) }}
      games={games}
      wsUrl={wsUrl}
    />
  );
}
