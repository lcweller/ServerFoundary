import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameServers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { dispatchCommand } from "@/lib/agent-hub";
import { deleteBackupRow, getBackup } from "@/lib/backups";
import { recordAudit, sourceIpFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function DELETE(
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

  // Delete the DB row immediately so the UI updates; ask the agent to
  // remove the file as well — best-effort.
  await deleteBackupRow(backupId);
  if (row.path) {
    void dispatchCommand(server.hostId, {
      type: "delete_backup",
      gameServerId: id,
      backupId,
      path: row.path,
    });
  }

  await recordAudit({
    hostId: server.hostId,
    userId: user.id,
    kind: "backup_delete",
    target: server.name,
    details: { gameServerId: id, backupId },
    sourceIp: sourceIpFromRequest(req),
  });
  return NextResponse.json({ ok: true });
}
