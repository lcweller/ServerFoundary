import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { destroySession, getCurrentUser } from "@/lib/auth";

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  await db.update(users).set({ name }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.delete(users).where(eq(users.id, user.id));
  await destroySession();
  return NextResponse.json({ ok: true });
}
