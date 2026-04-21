import { randomBytes, createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { enrollmentTokens, hosts } from "@/db/schema";

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const token = String(body.token ?? "");
  if (!token) {
    return NextResponse.json({ error: "Missing enrollment token" }, { status: 400 });
  }

  const [row] = await db
    .select()
    .from(enrollmentTokens)
    .where(eq(enrollmentTokens.token, token))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Invalid enrollment token" }, { status: 401 });
  }
  if (row.used) {
    return NextResponse.json({ error: "Token has already been used" }, { status: 401 });
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Token has expired" }, { status: 401 });
  }

  const apiKey = randomBytes(32).toString("hex");
  const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");

  const ipHeader = req.headers.get("x-forwarded-for");
  const ip = ipHeader?.split(",")[0]?.trim() ?? null;

  await db
    .update(hosts)
    .set({ apiKeyHash, status: "connecting", ipAddress: ip })
    .where(eq(hosts.id, row.hostId));

  await db
    .update(enrollmentTokens)
    .set({ used: true })
    .where(
      and(
        eq(enrollmentTokens.id, row.id),
        eq(enrollmentTokens.hostId, row.hostId),
      ),
    );

  const wsUrl =
    process.env.NEXT_PUBLIC_AGENT_WS_URL ??
    (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/^http/, "ws") ??
    "ws://localhost:3001";

  return NextResponse.json({
    apiKey,
    hostId: row.hostId,
    wsUrl: wsUrl ? wsUrl.replace(/\/$/, "") + "/api/v1/agent/ws" : undefined,
  });
}
