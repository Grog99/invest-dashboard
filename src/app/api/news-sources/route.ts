import { NextRequest, NextResponse } from "next/server";
import { db, newsSources } from "@/db";
import { fetchFeed, seedDefaultSourcesIfEmpty } from "@/lib/news";

export async function GET() {
  return NextResponse.json({ sources: seedDefaultSourcesIfEmpty() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "").trim();
  const companyId = body.companyId ? Number(body.companyId) : null;

  if (!name || !url) {
    return NextResponse.json(
      { error: "Nazwa i adres URL są wymagane." },
      { status: 400 }
    );
  }

  // Walidacja: czy kanał w ogóle daje się pobrać i sparsować.
  let itemCount = 0;
  try {
    const items = await fetchFeed(url);
    itemCount = items.length;
  } catch (e) {
    return NextResponse.json(
      {
        error: `Nie udało się pobrać kanału: ${e instanceof Error ? e.message : e}`,
      },
      { status: 400 }
    );
  }

  const created = db
    .insert(newsSources)
    .values({ name, url, companyId })
    .returning()
    .get();
  return NextResponse.json({ source: created, itemCount });
}
