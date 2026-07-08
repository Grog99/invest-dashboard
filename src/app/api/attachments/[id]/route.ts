import { NextRequest, NextResponse } from "next/server";
import { db, noteAttachments } from "@/db";
import { eq } from "drizzle-orm";
import { attachmentPath } from "@/lib/attachments";
import fs from "node:fs";

type Ctx = { params: Promise<{ id: string }> };

// Serwowanie bajtów załącznika. Content-Type bierzemy z kolumny mime (nie
// ufamy oryginalnemu file.type) — patrz docs/plans/zalaczniki-i-obrazy.md.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const attachmentId = Number(id);
  if (!Number.isInteger(attachmentId) || attachmentId <= 0) {
    return NextResponse.json({ error: "Nie znaleziono załącznika." }, { status: 404 });
  }

  const attachment = db
    .select()
    .from(noteAttachments)
    .where(eq(noteAttachments.id, attachmentId))
    .get();
  if (!attachment) {
    return NextResponse.json({ error: "Nie znaleziono załącznika." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await fs.promises.readFile(attachmentPath(attachment.id));
  } catch {
    return NextResponse.json({ error: "Plik załącznika nie istnieje." }, { status: 404 });
  }

  // Response body akceptuje Uint8Array<ArrayBuffer>, ale Buffer (Node) jest
  // typowany jako Uint8Array<ArrayBufferLike> — stąd jawna konwersja, żeby
  // zadowolić lib.dom.d.ts BodyInit.
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mime,
      "Content-Length": String(attachment.size),
      "Content-Disposition": `inline; filename="${attachment.filename}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// Usuwa pojedynczy załącznik — wiersz + plik. Brak sprawdzania "prawa" do
// notatki: aplikacja jest jednoużytkownikowa/lokalna, spójne z resztą API.
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const attachmentId = Number(id);
  const attachment = db
    .select()
    .from(noteAttachments)
    .where(eq(noteAttachments.id, attachmentId))
    .get();
  if (!attachment) {
    return NextResponse.json({ error: "Nie znaleziono załącznika." }, { status: 404 });
  }

  try {
    fs.unlinkSync(attachmentPath(attachment.id));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  db.delete(noteAttachments).where(eq(noteAttachments.id, attachmentId)).run();

  return NextResponse.json({ ok: true });
}
