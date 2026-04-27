import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  listNotifications,
  unreadCount,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const includeDismissed = url.searchParams.get("history") === "1";
  const limit = Math.min(
    Number(url.searchParams.get("limit") ?? "50") || 50,
    200,
  );

  const [items, unread] = await Promise.all([
    listNotifications(user.id, { includeDismissed, limit }),
    unreadCount(user.id),
  ]);
  return NextResponse.json({ notifications: items, unread });
}
