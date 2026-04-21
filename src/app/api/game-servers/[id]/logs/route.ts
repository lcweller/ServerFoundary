import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameServerLogs, gameServers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [server] = await db
    .select({ id: gameServers.id })
    .from(gameServers)
    .where(and(eq(gameServers.id, id), eq(gameServers.userId, user.id)))
    .limit(1);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const logs = await db
    .select()
    .from(gameServerLogs)
    .where(eq(gameServerLogs.gameServerId, id))
    .orderBy(desc(gameServerLogs.createdAt))
    .limit(500);

  return NextResponse.json({ logs });
}
