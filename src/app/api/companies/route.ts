import { NextRequest, NextResponse } from "next/server";
import { db, companies, INSTRUMENT_TYPES } from "@/db";
import { suggestQuoteSymbol } from "@/lib/yahoo";
import { refreshQuotes } from "@/lib/quotes";
import { nowISO } from "@/lib/format";

export async function GET() {
  return NextResponse.json({ companies: db.select().from(companies).all() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ticker = String(body.ticker ?? "").trim().toUpperCase();
  const name = String(body.name ?? "").trim();
  const market = ["GPW", "US", "OTHER"].includes(body.market)
    ? (body.market as string)
    : "GPW";
  const currency =
    String(body.currency ?? "").trim().toUpperCase() ||
    (market === "US" ? "USD" : "PLN");
  const type = INSTRUMENT_TYPES.includes(body.type)
    ? (body.type as string)
    : "STOCK";
  const quoteSymbol =
    String(body.quoteSymbol ?? "").trim().toUpperCase() ||
    suggestQuoteSymbol(ticker, market, type);
  const aliases = String(body.aliases ?? "").trim() || null;

  if (!ticker || !name) {
    return NextResponse.json(
      { error: "Ticker i nazwa spółki są wymagane." },
      { status: 400 }
    );
  }

  const created = db
    .insert(companies)
    .values({
      ticker,
      name,
      market,
      currency,
      quoteSymbol,
      watchlist: body.watchlist ? 1 : 0,
      aliases,
      type,
      createdAt: nowISO(),
    })
    .returning()
    .get();

  // Od razu próbujemy pobrać notowania — błąd nie blokuje utworzenia spółki.
  let refreshError: string | null = null;
  try {
    const result = await refreshQuotes([created.id]);
    if (result.errors.length > 0) {
      refreshError = result.errors.map((e) => e.message).join("; ");
    }
  } catch (e) {
    refreshError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ company: created, refreshError });
}
