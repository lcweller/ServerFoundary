import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hosts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { computeStatus } from "@/lib/hosts";
import { sendCommand } from "@/lib/agent-hub";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [host] = await db
    .select()
    .from(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .limit(1);

  if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ host: { ...host, effectiveStatus: computeStatus(host) } });
}

export async function PATCH(
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

  const name = body.name !== undefined ? String(body.name).trim() : undefined;
  if (name !== undefined && (name.length === 0 || name.length > 80)) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  const [updated] = await db
    .update(hosts)
    .set({ ...(name ? { name } : {}) })
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ host: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Best-effort notify the agent that it's being removed.
  try {
    sendCommand(id, { type: "host_removed" });
  } catch {}

  const result = await db
    .delete(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .returning({ id: hosts.id });

  if (result.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
