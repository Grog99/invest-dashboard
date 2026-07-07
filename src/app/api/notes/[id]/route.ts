import { NextRequest, NextResponse } from "next/server";
import { db, notes } from "@/db";
import { eq } from "drizzle-orm";
import { nowISO } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const note = db.select().from(notes).where(eq(notes.id, Number(id))).get();
  if (!note) {
    return NextResponse.json({ error: "Nie znaleziono notatki." }, { status: 404 });
  }
  return NextResponse.json({ note });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  const updates: Partial<typeof notes.$inferInsert> = { updatedAt: nowISO() };
  if (typeof body.title === "string" && body.title.trim()) {
    updates.title = body.title.trim();
  }
  if (typeof body.content === "string") updates.content = body.content;
  if (body.companyId !== undefined) {
    updates.companyId = body.companyId ? Number(body.companyId) : null;
  }

  const updated = db
    .update(notes)
    .set(updates)
    .where(eq(notes.id, Number(id)))
    .returning()
    .get();
  if (!updated) {
    return NextResponse.json({ error: "Nie znaleziono notatki." }, { status: 404 });
  }
  return NextResponse.json({ note: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  db.delete(notes).where(eq(notes.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
