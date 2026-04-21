import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hosts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { computeStatus } from "@/lib/hosts";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [host] = await db
    .select({
      id: hosts.id,
      status: hosts.status,
      lastHeartbeatAt: hosts.lastHeartbeatAt,
      apiKeyHash: hosts.apiKeyHash,
    })
    .from(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .limit(1);

  if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    status: computeStatus(host as never),
    enrolled: host.apiKeyHash !== null,
    lastHeartbeatAt: host.lastHeartbeatAt,
  });
}
