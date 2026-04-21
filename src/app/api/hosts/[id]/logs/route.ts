import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { gameServers, gameServerLogs, hosts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [host] = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .limit(1);
  if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const serverRows = await db
    .select({ id: gameServers.id, name: gameServers.name })
    .from(gameServers)
    .where(eq(gameServers.hostId, id));

  const ids = serverRows.map((r) => r.id);
  if (ids.length === 0) {
    return NextResponse.json({ logs: [], servers: serverRows });
  }

  const logs = await db
    .select()
    .from(gameServerLogs)
    .where(inArray(gameServerLogs.gameServerId, ids))
    .orderBy(desc(gameServerLogs.createdAt))
    .limit(500);

  return NextResponse.json({ logs, servers: serverRows });
}
