import { NextRequest, NextResponse } from "next/server";
import { db, newsItems, newsCompany } from "@/db";
import { eq, ne } from "drizzle-orm";

// PATCH: oznaczanie jako przeczytane — pojedynczy news lub wszystkie.
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (body.allRead) {
    db.update(newsItems).set({ read: 1 }).where(ne(newsItems.read, 1)).run();
    return NextResponse.json({ ok: true });
  }
  const id = Number(body.id);
  if (!id) {
    return NextResponse.json({ error: "Brak id newsa." }, { status: 400 });
  }
  db.update(newsItems)
    .set({ read: body.read === false ? 0 : 1 })
    .where(eq(newsItems.id, id))
    .run();
  return NextResponse.json({ ok: true });
}

// DELETE: czyszczenie wszystkich newsów (np. po zmianie źródeł).
export async function DELETE() {
  db.delete(newsCompany).run();
  db.delete(newsItems).run();
  return NextResponse.json({ ok: true });
}
