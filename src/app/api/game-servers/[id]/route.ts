import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameServers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { dispatchCommand } from "@/lib/agent-hub";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [server] = await db
    .select()
    .from(gameServers)
    .where(and(eq(gameServers.id, id), eq(gameServers.userId, user.id)))
    .limit(1);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Tear down the external tunnel first so the ws-server releases the
  // TCP listener port before the agent stops the game process.
  await dispatchCommand(server.hostId, {
    type: "end_tunnel",
    gameServerId: id,
  });

  await dispatchCommand(server.hostId, {
    type: "delete_game_server",
    gameServerId: id,
  });

  // Tunnels row is removed by the ON DELETE CASCADE on gameServerId.
  await db.delete(gameServers).where(eq(gameServers.id, id));
  return NextResponse.json({ ok: true });
}
