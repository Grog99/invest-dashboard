import { NextRequest, NextResponse } from "next/server";
import { db, notes, noteAttachments } from "@/db";
import { eq } from "drizzle-orm";
import { nowISO } from "@/lib/format";
import { attachmentPath } from "@/lib/attachments";
import fs from "node:fs";

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
  const noteId = Number(id);

  // Zbieramy id załączników PRZED usunięciem notatki — po delete FK ON DELETE
  // CASCADE sprząta wiersze note_attachments, więc id trzeba mieć już w
  // pamięci, żeby skasować odpowiadające im pliki z dysku.
  const attachments = db
    .select({ id: noteAttachments.id })
    .from(noteAttachments)
    .where(eq(noteAttachments.noteId, noteId))
    .all();

  db.delete(notes).where(eq(notes.id, noteId)).run();

  for (const a of attachments) {
    try {
      fs.unlinkSync(attachmentPath(a.id));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }

  return NextResponse.json({ ok: true });
}
