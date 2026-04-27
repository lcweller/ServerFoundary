import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameServers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { dispatchCommand } from "@/lib/agent-hub";
import { isHostOnline } from "@/lib/hosts";
import { getBackup } from "@/lib/backups";
import { recordAudit, sourceIpFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; backupId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, backupId } = await params;

  const [server] = await db
    .select()
    .from(gameServers)
    .where(and(eq(gameServers.id, id), eq(gameServers.userId, user.id)))
    .limit(1);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await getBackup(backupId);
  if (!row || row.gameServerId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (row.status !== "success" || !row.path) {
    return NextResponse.json(
      { error: "Backup is not restorable." },
      { status: 409 },
    );
  }
  if (!(await isHostOnline(server.hostId))) {
    return NextResponse.json(
      { error: "Host agent is offline." },
      { status: 409 },
    );
  }

  const ok = await dispatchCommand(server.hostId, {
    type: "restore_game_server",
    gameServerId: id,
    backupId,
    path: row.path,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "Could not reach host agent." },
      { status: 503 },
    );
  }
  await recordAudit({
    hostId: server.hostId,
    userId: user.id,
    kind: "backup_restore",
    target: server.name,
    details: { gameServerId: id, backupId, path: row.path },
    sourceIp: sourceIpFromRequest(req),
  });
  return NextResponse.json({ ok: true });
}
