import { NextRequest, NextResponse } from "next/server";
import { db, noteTemplates } from "@/db";
import { eq } from "drizzle-orm";
import { nowISO } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  const updates: Partial<typeof noteTemplates.$inferInsert> = { updatedAt: nowISO() };
  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body.content === "string") updates.content = body.content;

  const updated = db
    .update(noteTemplates)
    .set(updates)
    .where(eq(noteTemplates.id, Number(id)))
    .returning()
    .get();
  if (!updated) {
    return NextResponse.json({ error: "Nie znaleziono szablonu." }, { status: 404 });
  }
  return NextResponse.json({ template: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  db.delete(noteTemplates).where(eq(noteTemplates.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
