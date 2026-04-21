import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameServers, gameServerLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { sendCommand, isAgentConnected } from "@/lib/agent-hub";

const ALLOWED = new Set(["start", "stop", "restart"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  if (!ALLOWED.has(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const [server] = await db
    .select()
    .from(gameServers)
    .where(and(eq(gameServers.id, id), eq(gameServers.userId, user.id)))
    .limit(1);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isAgentConnected(server.hostId)) {
    return NextResponse.json(
      { error: "Host agent is offline." },
      { status: 409 },
    );
  }

  sendCommand(server.hostId, {
    type: `${action}_game_server`,
    gameServerId: id,
  });

  await db.insert(gameServerLogs).values({
    gameServerId: id,
    source: "system",
    level: "info",
    message: `User requested ${action}.`,
  });

  return NextResponse.json({ ok: true });
}
