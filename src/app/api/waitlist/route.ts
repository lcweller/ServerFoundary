import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { waitlistSignups } from "@/db/schema";
import { validateEmail } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; source?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const source = typeof body.source === "string" ? body.source.slice(0, 64) : null;

  const emailErr = validateEmail(email);
  if (emailErr) {
    return NextResponse.json({ error: emailErr }, { status: 400 });
  }

  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 256) ?? null;

  try {
    await db
      .insert(waitlistSignups)
      .values({ email, source, ip, userAgent })
      .onConflictDoNothing({ target: waitlistSignups.email });
  } catch {
    return NextResponse.json(
      { error: "Couldn't save your signup right now. Try again in a minute." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
