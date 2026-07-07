// Klient NBP — kursy średnie (tabela A) z cache w tabeli fx_rates.
// Pod PIT-38 obowiązuje kurs z dnia roboczego poprzedzającego transakcję (D-1).

import { db, fxRates } from "@/db";
import { and, eq, lt, lte, desc, sql } from "drizzle-orm";
import { todayISO } from "./format";

const NBP_BASE = "https://api.nbp.pl/api/exchangerates/rates/a";

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchRange(
  currency: string,
  from: string,
  to: string
): Promise<{ date: string; rate: number }[]> {
  const url = `${NBP_BASE}/${currency.toLowerCase()}/${from}/${to}/?format=json`;
  const res = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return []; // brak notowań w zakresie (np. same weekendy)
  if (!res.ok) throw new Error(`NBP: HTTP ${res.status} dla ${currency}`);
  const data = (await res.json()) as {
    rates: { effectiveDate: string; mid: number }[];
  };
  return data.rates.map((r) => ({ date: r.effectiveDate, rate: r.mid }));
}

function upsertRates(currency: string, rows: { date: string; rate: number }[]) {
  if (rows.length === 0) return;
  const values = rows.map((r) => ({
    currency: currency.toUpperCase(),
    date: r.date,
    rate: r.rate,
  }));
  for (let i = 0; i < values.length; i += 400) {
    db.insert(fxRates)
      .values(values.slice(i, i + 400))
      .onConflictDoNothing()
      .run();
  }
}

// Zapewnia w cache kursy waluty od fromDate (minus bufor na dni wolne) do dziś.
export async function ensureFxRates(
  currency: string,
  fromDate: string
): Promise<void> {
  const cur = currency.toUpperCase();
  if (cur === "PLN") return;

  const start = addDays(fromDate, -10);
  const today = todayISO();

  const bounds = db
    .select({
      min: sql<string | null>`min(${fxRates.date})`,
      max: sql<string | null>`max(${fxRates.date})`,
    })
    .from(fxRates)
    .where(eq(fxRates.currency, cur))
    .get();

  const ranges: [string, string][] = [];
  if (!bounds?.min || !bounds.max) {
    ranges.push([start, today]);
  } else {
    if (start < bounds.min) ranges.push([start, bounds.min]);
    if (bounds.max < today) ranges.push([bounds.max, today]);
  }

  for (const [from, to] of ranges) {
    // NBP ogranicza zapytanie do ~255 notowań — dzielimy na kawałki po ~250 dni.
    let cursor = from;
    while (cursor <= to) {
      const chunkEnd = addDays(cursor, 250) < to ? addDays(cursor, 250) : to;
      upsertRates(cur, await fetchRange(cur, cursor, chunkEnd));
      if (chunkEnd === to) break;
      cursor = addDays(chunkEnd, 1);
    }
  }
}

// Kurs D-1: ostatni kurs opublikowany PRZED podaną datą (zasada podatkowa).
export function getFxRateBefore(currency: string, date: string): number | null {
  const cur = currency.toUpperCase();
  if (cur === "PLN") return 1;
  const row = db
    .select()
    .from(fxRates)
    .where(and(eq(fxRates.currency, cur), lt(fxRates.date, date)))
    .orderBy(desc(fxRates.date))
    .limit(1)
    .get();
  return row?.rate ?? null;
}

// Ostatni znany kurs na dany dzień włącznie (do bieżącej wyceny).
export function getFxRateOnOrBefore(
  currency: string,
  date: string
): number | null {
  const cur = currency.toUpperCase();
  if (cur === "PLN") return 1;
  const row = db
    .select()
    .from(fxRates)
    .where(and(eq(fxRates.currency, cur), lte(fxRates.date, date)))
    .orderBy(desc(fxRates.date))
    .limit(1)
    .get();
  return row?.rate ?? null;
}

export function getLatestFxRate(currency: string): number | null {
  return getFxRateOnOrBefore(currency, todayISO());
}
