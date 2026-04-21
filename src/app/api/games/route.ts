import { NextResponse } from "next/server";
import { db } from "@/db";
import { supportedGames } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(supportedGames).orderBy(supportedGames.name);
  return NextResponse.json({ games: rows });
}
