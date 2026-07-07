import { NextRequest, NextResponse } from "next/server";
import { db, dividends } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  db.delete(dividends).where(eq(dividends.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
