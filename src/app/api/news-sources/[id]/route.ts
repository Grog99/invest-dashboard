import { NextRequest, NextResponse } from "next/server";
import { db, newsSources } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  const updates: Partial<typeof newsSources.$inferInsert> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body.url === "string" && body.url.trim()) {
    updates.url = body.url.trim();
  }
  if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;
  if (body.companyId !== undefined) {
    updates.companyId = body.companyId ? Number(body.companyId) : null;
  }

  const updated = db
    .update(newsSources)
    .set(updates)
    .where(eq(newsSources.id, Number(id)))
    .returning()
    .get();
  if (!updated) {
    return NextResponse.json({ error: "Nie znaleziono źródła." }, { status: 404 });
  }
  return NextResponse.json({ source: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  db.delete(newsSources).where(eq(newsSources.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
