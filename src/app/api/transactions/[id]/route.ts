import { NextRequest, NextResponse } from "next/server";
import { db, transactions } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  const updates: Partial<typeof transactions.$inferInsert> = {};
  if (body.type === "BUY" || body.type === "SELL") updates.type = body.type;
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
    updates.date = body.date;
  }
  if (body.quantity !== undefined && Number(body.quantity) > 0) {
    updates.quantity = Number(body.quantity);
  }
  if (body.price !== undefined && Number(body.price) >= 0) {
    updates.price = Number(body.price);
  }
  if (body.commission !== undefined) {
    updates.commission = Number(body.commission) || 0;
  }
  if (body.note !== undefined) {
    updates.note = String(body.note).trim() || null;
  }

  const updated = db
    .update(transactions)
    .set(updates)
    .where(eq(transactions.id, Number(id)))
    .returning()
    .get();
  if (!updated) {
    return NextResponse.json({ error: "Nie znaleziono transakcji." }, { status: 404 });
  }
  return NextResponse.json({ transaction: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  db.delete(transactions).where(eq(transactions.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
