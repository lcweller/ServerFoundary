import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameServers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { dispatchCommand } from "@/lib/agent-hub";
import { isHostOnline } from "@/lib/hosts";
import {
  createPendingBackup,
  listBackupsForServer,
  markBackupFailed,
} from "@/lib/backups";
import { recordAudit, sourceIpFromRequest } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(
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

  const rows = await listBackupsForServer(id);
  return NextResponse.json({ backups: rows });
}

export async function POST(
  req: NextRequest,
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
  if (!(await isHostOnline(server.hostId))) {
    return NextResponse.json(
      { error: "Host agent is offline." },
      { status: 409 },
    );
  }

  const row = await createPendingBackup({
    gameServerId: id,
    hostId: server.hostId,
    userId: user.id,
    trigger: "manual",
  });
  const ok = await dispatchCommand(server.hostId, {
    type: "backup_game_server",
    gameServerId: id,
    backupId: row.id,
  });
  if (!ok) {
    await markBackupFailed(row.id, "Could not reach host agent");
    return NextResponse.json(
      { error: "Could not reach host agent." },
      { status: 503 },
    );
  }
  await recordAudit({
    hostId: server.hostId,
    userId: user.id,
    kind: "backup_create",
    target: server.name,
    details: { gameServerId: id, backupId: row.id, trigger: "manual" },
    sourceIp: sourceIpFromRequest(req),
  });
  return NextResponse.json({ backup: row });
}
