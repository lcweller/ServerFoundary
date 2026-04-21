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

export async function POST(req: NextRequest) {
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
