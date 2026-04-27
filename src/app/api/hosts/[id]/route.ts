import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hosts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { computeStatus } from "@/lib/hosts";
import { dispatchCommand } from "@/lib/agent-hub";
import { recordAudit, sourceIpFromRequest } from "@/lib/audit";

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
  const terminalEnabled =
    typeof body.terminalEnabled === "boolean" ? body.terminalEnabled : undefined;

  if (name !== undefined && (name.length === 0 || name.length > 80)) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  // Look up the prior values so we can audit just the diffs and reject
  // the request if it doesn't actually change anything.
  const [prior] = await db
    .select()
    .from(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .limit(1);
  if (!prior) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (name !== undefined && name !== prior.name) patch.name = name;
  if (
    terminalEnabled !== undefined &&
    terminalEnabled !== prior.terminalEnabled
  ) {
    patch.terminalEnabled = terminalEnabled;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ host: prior });
  }

  const [updated] = await db
    .update(hosts)
    .set(patch)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .returning();

  const ip = sourceIpFromRequest(req);
  if (patch.name) {
    await recordAudit({
      hostId: id,
      userId: user.id,
      kind: "host_rename",
      target: String(patch.name),
      details: { from: prior.name, to: patch.name },
      sourceIp: ip,
    });
  }
  if ("terminalEnabled" in patch) {
    await recordAudit({
      hostId: id,
      userId: user.id,
      kind: "host_terminal_toggle",
      details: { enabled: patch.terminalEnabled },
      sourceIp: ip,
    });
  }

  return NextResponse.json({ host: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Look up the host first so we can audit the name (the row gets cascaded
  // out before the audit insert otherwise — and the FK nulls out the
  // host_id reference, leaving us with a useless dangling event).
  const [prior] = await db
    .select()
    .from(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .limit(1);
  if (!prior) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Audit BEFORE the cascade deletes our row out from under us.
  await recordAudit({
    hostId: id,
    userId: user.id,
    kind: "host_delete",
    target: prior.name,
    sourceIp: sourceIpFromRequest(req),
  });

  // Best-effort notify the agent that it's being removed.
  try {
    await dispatchCommand(id, { type: "host_removed" });
  } catch {}

  await db
    .delete(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)));

  return NextResponse.json({ ok: true });
}
