import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gameServers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getBackupConfig, setBackupConfig } from "@/lib/backups";
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

  const config = await getBackupConfig(id);
  return NextResponse.json({ config });
}

export async function PUT(
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: {
    enabled?: boolean;
    everyHours?: number;
    retentionCount?: number;
  } = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.everyHours === "number") patch.everyHours = body.everyHours;
  if (typeof body.retentionCount === "number") {
    patch.retentionCount = body.retentionCount;
  }

  const config = await setBackupConfig(id, patch);
  await recordAudit({
    hostId: server.hostId,
    userId: user.id,
    kind: "backup_config_change",
    target: server.name,
    details: { gameServerId: id, ...patch },
    sourceIp: sourceIpFromRequest(req),
  });
  return NextResponse.json({ config });
}
