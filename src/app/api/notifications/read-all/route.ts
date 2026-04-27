import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await markAllRead(user.id);
  return NextResponse.json({ ok: true });
}
