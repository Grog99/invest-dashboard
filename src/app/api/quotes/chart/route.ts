import { NextRequest, NextResponse } from "next/server";
import { db, companies, quotesDaily } from "@/db";
import { and, asc, eq, gt, gte, sql } from "drizzle-orm";
import type { CandlePoint } from "@/components/charts/CandleChart";

// GET: bary OHLC dla osadzonego wykresu w notatkach/AI Chat (feature 5.2,
// blok ```chart <SYMBOL> [ZAKRES]``` w Markdown.tsx). Lookup spółki po
// symbolu jest case-insensitive: najpierw ticker, potem quoteSymbol. Zwraca
// całą 5-letnią historię (jak strona spółki) — filtrowanie po zakresie robi
// już PriceChart po stronie klienta. Route Handler nie jest cache'owany
// domyślnie (patrz node_modules/next/dist/docs/01-app/01-getting-started/
// 15-route-handlers.md), więc nie trzeba dodawać `export const dynamic`.
export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol")?.trim();
  if (!symbol) {
    return NextResponse.json(
      { error: "Brak parametru symbol." },
      { status: 400 }
    );
  }

  const company =
    db
      .select()
      .from(companies)
      .where(sql`lower(${companies.ticker}) = lower(${symbol})`)
      .get() ??
    db
      .select()
      .from(companies)
      .where(sql`lower(${companies.quoteSymbol}) = lower(${symbol})`)
      .get();

  if (!company) {
    return NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 });
  }

  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const rows = db
    .select({
      date: quotesDaily.date,
      open: quotesDaily.open,
      high: quotesDaily.high,
      low: quotesDaily.low,
      close: quotesDaily.close,
      volume: quotesDaily.volume,
    })
    .from(quotesDaily)
    .where(
      and(
        eq(quotesDaily.companyId, company.id),
        gte(quotesDaily.date, fiveYearsAgo.toISOString().slice(0, 10)),
        // Zerowe świece (glitch Yahoo) to śmieć — nigdy realne notowanie.
        gt(quotesDaily.close, 0)
      )
    )
    .orderBy(asc(quotesDaily.date))
    .all();

  const bars: CandlePoint[] = rows.map((r) => ({
    time: r.date,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    volume: r.volume,
  }));

  return NextResponse.json({
    ticker: company.ticker,
    currency: company.currency,
    bars,
  });
}
