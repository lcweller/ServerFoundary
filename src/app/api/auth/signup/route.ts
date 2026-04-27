import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import {
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/validation";
import { rateLimit, sweepExpiredBuckets } from "@/lib/rate-limit";
import { sourceIpFromRequest } from "@/lib/audit";

export async function POST(req: NextRequest) {
  // PROJECT.md §3.9 — 5 signups/hour/IP keeps automated abuse from
  // filling the user table; legitimate users only sign up once.
  sweepExpiredBuckets();
  const ip = sourceIpFromRequest(req) ?? "unknown";
  const rl = rateLimit(`signup:${ip}`, { max: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many signups from this network. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();

  const emailError = validateEmail(email);
  if (emailError) return NextResponse.json({ error: emailError }, { status: 400 });
  const nameError = validateName(name);
  if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
  const passwordError = validatePassword(password);
  if (passwordError)
    return NextResponse.json({ error: passwordError }, { status: 400 });

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash, name })
    .returning({ id: users.id });

  const token = await createSession(user.id);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
