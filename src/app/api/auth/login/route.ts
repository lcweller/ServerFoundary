import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { sourceIpFromRequest } from "@/lib/audit";

export async function POST(req: NextRequest) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 },
    );
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    // Quietly notify the real account owner that someone got their
    // email right but the password wrong (PROJECT.md §3.11). We never
    // signal back to the caller whether the email matched, so a
    // probing attacker still gets a generic 401.
    notify({
      userId: user.id,
      kind: "auth_failure",
      severity: "warn",
      title: "Failed sign-in attempt",
      body: `From ${sourceIpFromRequest(req) ?? "unknown IP"}`,
    });
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  const token = await createSession(user.id);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
