import { NextRequest, NextResponse } from "next/server";
import { db, newsItems, newsCompany } from "@/db";
import { eq, ne } from "drizzle-orm";
import { listNews, encodeCursor, decodeCursor, type NewsCursor } from "@/lib/news";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// GET: kolejna porcja newsów (infinite scroll na /news) — kursor keyset
// w parametrze `cursor`, respektuje filtry `company`/`unread`, `limit`
// zclampowany do [1, 100]. Zwraca { items, nextCursor }; nextCursor === null
// oznacza koniec historii. Route Handler nie jest cache'owany domyślnie
// (patrz node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md),
// więc nie trzeba dodawać `export const dynamic`.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const companyParam = sp.get("company");
  const companyId = companyParam ? Number(companyParam) : undefined;
  const unreadOnly = sp.get("unread") === "1";

  const limitParam = sp.get("limit");
  const parsedLimit = limitParam ? Number(limitParam) : NaN;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.trunc(parsedLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const cursorParam = sp.get("cursor");
  let cursor: NewsCursor | undefined;
  if (cursorParam) {
    const decoded = decodeCursor(cursorParam);
    if (!decoded) {
      return NextResponse.json(
        { error: "Nieprawidłowy kursor." },
        { status: 400 }
      );
    }
    cursor = decoded;
  }

  const items = listNews({ companyId, unreadOnly, limit, cursor });
  const nextCursor =
    items.length === limit ? encodeCursor(items[items.length - 1]) : null;

  return NextResponse.json({ items, nextCursor });
}

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
