import { NextRequest, NextResponse } from "next/server";
import { db, notes, noteAttachments } from "@/db";
import { eq } from "drizzle-orm";
import { nowISO } from "@/lib/format";
import {
  ALLOWED_IMAGE_MIME,
  MAX_ATTACHMENT_BYTES,
  attachmentPath,
  ensureAttachmentsDir,
  processImage,
  sniffImageMime,
} from "@/lib/attachments";
import fs from "node:fs";

type Ctx = { params: Promise<{ id: string }> };

// Upload załącznika (obrazu) do notatki — kolejność operacji: patrz
// docs/plans/zalaczniki-i-obrazy.md ("Podejście / Upload — kolejność
// operacji"). Insert wiersza dopiero po walidacji/przetworzeniu, zapis pliku
// dopiero po poznaniu id (autoincrement), rollback wiersza przy błędzie I/O.
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const noteId = Number(id);
  const note = db.select().from(notes).where(eq(notes.id, noteId)).get();
  if (!note) {
    return NextResponse.json({ error: "Nie znaleziono notatki." }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Brak pliku." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: "Plik przekracza limit 10 MB." },
      { status: 413 }
    );
  }
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Niedozwolony typ pliku." },
      { status: 415 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json(
      { error: "Plik przekracza limit 10 MB." },
      { status: 413 }
    );
  }
  const realMime = sniffImageMime(buf);
  if (!realMime || !ALLOWED_IMAGE_MIME.has(realMime)) {
    return NextResponse.json(
      { error: "Plik nie jest obsługiwanym obrazem." },
      { status: 415 }
    );
  }

  let processed: Buffer;
  try {
    processed = await processImage(buf, realMime);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Nie udało się przetworzyć obrazu." },
      { status: 422 }
    );
  }

  const created = db
    .insert(noteAttachments)
    .values({
      noteId,
      filename: file.name || "obraz",
      mime: realMime,
      size: processed.length,
      createdAt: nowISO(),
    })
    .returning()
    .get();

  try {
    ensureAttachmentsDir();
    fs.writeFileSync(attachmentPath(created.id), processed);
  } catch (e) {
    // Rollback: nie zostawiamy wiersza bez pliku na dysku.
    db.delete(noteAttachments).where(eq(noteAttachments.id, created.id)).run();
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Nie udało się zapisać pliku." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    attachment: {
      id: created.id,
      filename: created.filename,
      mime: created.mime,
      size: created.size,
    },
    url: `/api/attachments/${created.id}`,
  });
}
