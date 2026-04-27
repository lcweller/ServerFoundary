import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hosts, enrollmentTokens } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit, sourceIpFromRequest } from "@/lib/audit";

const ENROLLMENT_TTL_MS = 60 * 60 * 1000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db
    .select()
    .from(hosts)
    .where(eq(hosts.userId, user.id))
    .orderBy(hosts.createdAt);
  return NextResponse.json({ hosts: rows });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim() || "My Game Server";
  if (name.length > 80) {
    return NextResponse.json({ error: "Name is too long." }, { status: 400 });
  }

  const [host] = await db
    .insert(hosts)
    .values({ userId: user.id, name, status: "connecting" })
    .returning();

  const token = randomBytes(16).toString("hex");
  await db.insert(enrollmentTokens).values({
    userId: user.id,
    hostId: host.id,
    token,
    expiresAt: new Date(Date.now() + ENROLLMENT_TTL_MS),
  });

  await recordAudit({
    hostId: host.id,
    userId: user.id,
    kind: "host_create",
    target: host.name,
    sourceIp: sourceIpFromRequest(req),
  });

  return NextResponse.json({ host, enrollmentToken: token });
}
