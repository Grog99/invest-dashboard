import { NextRequest, NextResponse } from "next/server";
import { db, companies } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const companyId = Number(id);
  const body = await req.json();

  const updates: Partial<typeof companies.$inferInsert> = {};
  if (typeof body.ticker === "string" && body.ticker.trim()) {
    updates.ticker = body.ticker.trim().toUpperCase();
  }
  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (["GPW", "US", "OTHER"].includes(body.market)) {
    updates.market = body.market;
  }
  if (typeof body.currency === "string" && body.currency.trim()) {
    updates.currency = body.currency.trim().toUpperCase();
  }
  if (typeof body.quoteSymbol === "string" && body.quoteSymbol.trim()) {
    updates.quoteSymbol = body.quoteSymbol.trim().toUpperCase();
  }
  if (body.watchlist !== undefined) {
    updates.watchlist = body.watchlist ? 1 : 0;
  }
  if (body.aliases !== undefined) {
    updates.aliases = String(body.aliases).trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Brak zmian do zapisania." }, { status: 400 });
  }

  const updated = db
    .update(companies)
    .set(updates)
    .where(eq(companies.id, companyId))
    .returning()
    .get();
  if (!updated) {
    return NextResponse.json({ error: "Nie znaleziono spółki." }, { status: 404 });
  }
  return NextResponse.json({ company: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  db.delete(companies).where(eq(companies.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
