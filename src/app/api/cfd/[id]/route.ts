import { NextRequest, NextResponse } from "next/server";
import { db, cfdPositions } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

// Kalka symbolu z quoteSymbol — patrz komentarz w src/app/api/cfd/route.ts.
function deriveSymbol(quoteSymbol: string): string {
  const cleaned = quoteSymbol.replace(/^\^/, "").replace(/\.[A-Za-z]{1,3}$/, "");
  return cleaned || quoteSymbol;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  const updates: Partial<typeof cfdPositions.$inferInsert> = {};
  if (body.direction === "LONG" || body.direction === "SHORT") {
    updates.direction = body.direction;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name) updates.name = name;
  }
  if (body.volume !== undefined && Number(body.volume) > 0) {
    updates.volume = Number(body.volume);
  }
  if (body.openPrice !== undefined && Number(body.openPrice) > 0) {
    updates.openPrice = Number(body.openPrice);
  }
  if (body.pointValue !== undefined && Number(body.pointValue) > 0) {
    updates.pointValue = Number(body.pointValue);
  }
  if (body.quoteSymbol !== undefined) {
    const quoteSymbol = String(body.quoteSymbol).trim().toUpperCase();
    if (quoteSymbol) {
      updates.quoteSymbol = quoteSymbol;
      updates.symbol = deriveSymbol(quoteSymbol);
    }
  }
  if (
    typeof body.openedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(body.openedAt)
  ) {
    updates.openedAt = body.openedAt;
  }
  // Override — undefined = nie dotykaj, null/"" = wyczyść, liczba = ustaw.
  if (body.overridePrice !== undefined) {
    updates.overridePrice =
      body.overridePrice === null || body.overridePrice === ""
        ? null
        : Number(body.overridePrice);
  }
  if (body.overridePnl !== undefined) {
    updates.overridePnl =
      body.overridePnl === null || body.overridePnl === ""
        ? null
        : Number(body.overridePnl);
  }
  if (body.note !== undefined) {
    updates.note = String(body.note).trim() || null;
  }

  const updated = db
    .update(cfdPositions)
    .set(updates)
    .where(eq(cfdPositions.id, Number(id)))
    .returning()
    .get();
  if (!updated) {
    return NextResponse.json({ error: "Nie znaleziono pozycji CFD." }, { status: 404 });
  }
  return NextResponse.json({ position: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  db.delete(cfdPositions).where(eq(cfdPositions.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
