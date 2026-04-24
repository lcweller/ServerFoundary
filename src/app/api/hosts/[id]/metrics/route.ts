import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hosts } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { readMetrics, type MetricsRange } from "@/lib/metrics";

const VALID_RANGES: MetricsRange[] = ["1h", "24h", "7d", "30d"];

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const [host] = await db
    .select({ id: hosts.id })
    .from(hosts)
    .where(and(eq(hosts.id, id), eq(hosts.userId, user.id)))
    .limit(1);
  if (!host) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const urlRange = req.nextUrl.searchParams.get("range") ?? "1h";
  const range = VALID_RANGES.includes(urlRange as MetricsRange)
    ? (urlRange as MetricsRange)
    : "1h";

  const points = await readMetrics(id, range);
  return NextResponse.json({ range, points });
}
