// Orkiestracja odświeżania notowań: historia dzienna + bieżąca cena
// z Yahoo Finance, kursy walut z NBP. Wyniki trafiają do cache w SQLite.

import {
  db,
  companies,
  transactions,
  dividends,
  quotesDaily,
  quotesLatest,
  cfdPositions,
  type Company,
  type CfdPosition,
} from "@/db";
import { and, eq, gt, lt, desc, sql } from "drizzle-orm";
import { fetchChart } from "./yahoo";
import { ensureFxRates } from "./nbp";
import { nowISO, todayISO } from "./format";

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function prevCloseFor(companyId: number, beforeDate: string): number | null {
  const row = db
    .select({ close: quotesDaily.close })
    .from(quotesDaily)
    .where(
      and(
        eq(quotesDaily.companyId, companyId),
        lt(quotesDaily.date, beforeDate),
        // Zerowa świeca (glitch) nie może udawać poprzedniego zamknięcia —
        // inaczej dzienna zmiana = (cena − 0) × akcje = cała wartość pozycji.
        gt(quotesDaily.close, 0)
      )
    )
    .orderBy(desc(quotesDaily.date))
    .limit(1)
    .get();
  return row?.close ?? null;
}

async function refreshCompany(company: Company): Promise<boolean> {
  const last = db
    .select({ max: sql<string | null>`max(${quotesDaily.date})` })
    .from(quotesDaily)
    .where(eq(quotesDaily.companyId, company.id))
    .get();

  // Incrementalnie od ostatniej świecy (z zakładką 7 dni),
  // pełna historia dzienna przy pierwszym pobraniu.
  const chart = await fetchChart(
    company.quoteSymbol,
    last?.max ? addDays(last.max, -7) : undefined
  );

  if (chart.bars.length > 0) {
    const values = chart.bars.map((b) => ({
      companyId: company.id,
      date: b.date,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
    for (let i = 0; i < values.length; i += 400) {
      db.insert(quotesDaily)
        .values(values.slice(i, i + 400))
        .onConflictDoUpdate({
          target: [quotesDaily.companyId, quotesDaily.date],
          set: {
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            close: sql`excluded.close`,
            volume: sql`excluded.volume`,
          },
        })
        .run();
    }
  }

  if (chart.price === null) return false;

  const quoteDate = chart.marketDate ?? todayISO();
  const prevClose = prevCloseFor(company.id, quoteDate);
  db.insert(quotesLatest)
    .values({
      companyId: company.id,
      price: chart.price,
      prevClose,
      date: quoteDate,
      time: chart.marketTime,
      updatedAt: nowISO(),
    })
    .onConflictDoUpdate({
      target: quotesLatest.companyId,
      set: {
        price: chart.price,
        prevClose,
        date: quoteDate,
        time: chart.marketTime,
        updatedAt: nowISO(),
      },
    })
    .run();
  return true;
}

// CFD nie ma historii OHLC w Yahoo (WIG20.WA zwraca tylko bieżącą cenę) —
// zapisujemy WYŁĄCZNIE quote_price/quote_updated_at, bez quotes_daily.
async function refreshCfdPosition(position: CfdPosition): Promise<boolean> {
  const chart = await fetchChart(position.quoteSymbol);
  if (chart.price === null) return false;
  db.update(cfdPositions)
    .set({ quotePrice: chart.price, quoteUpdatedAt: nowISO() })
    .where(eq(cfdPositions.id, position.id))
    .run();
  return true;
}

export interface RefreshResult {
  updated: number;
  errors: { company: string; message: string }[];
}

export async function refreshQuotes(
  companyIds?: number[]
): Promise<RefreshResult> {
  let list = db.select().from(companies).all();
  if (companyIds && companyIds.length > 0) {
    const idSet = new Set(companyIds);
    list = list.filter((c) => idSet.has(c.id));
  }

  const result: RefreshResult = { updated: 0, errors: [] };
  // Pozycje CFD odświeżane tylko przy pełnym odświeżeniu (bez companyIds) —
  // wąskie odświeżenie pojedynczej spółki (np. zaraz po jej dodaniu) nie
  // powinno przy okazji bić w Yahoo po WIG20.WA za każdym razem.
  const cfdList = companyIds ? [] : db.select().from(cfdPositions).all();
  if (list.length === 0 && cfdList.length === 0) return result;

  // 1. Kursy walut — od najwcześniejszej transakcji/dywidendy (potrzebne do
  //    kursów D-1 pod PIT), minimum 2 lata wstecz pod wykresy.
  const minTx = db
    .select({ min: sql<string | null>`min(${transactions.date})` })
    .from(transactions)
    .get();
  const minDiv = db
    .select({ min: sql<string | null>`min(${dividends.date})` })
    .from(dividends)
    .get();
  let fxFrom = addDays(todayISO(), -730);
  if (minTx?.min && minTx.min < fxFrom) fxFrom = minTx.min;
  if (minDiv?.min && minDiv.min < fxFrom) fxFrom = minDiv.min;

  const currencies = [...new Set(list.map((c) => c.currency.toUpperCase()))];
  for (const cur of currencies) {
    if (cur === "PLN") continue;
    try {
      await ensureFxRates(cur, fxFrom);
    } catch (e) {
      result.errors.push({
        company: `NBP/${cur}`,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 2. Notowania per spółka — jedno zapytanie łączy historię i bieżącą cenę.
  for (const company of list) {
    try {
      if (await refreshCompany(company)) result.updated++;
    } catch (e) {
      result.errors.push({
        company: company.ticker,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 3. Pozycje CFD — tylko bieżąca cena (WIG20.WA w PLN, bez FX). Błąd per
  // pozycja trafia do result.errors i nie wywala odświeżania spółek powyżej.
  for (const position of cfdList) {
    try {
      if (await refreshCfdPosition(position)) result.updated++;
    } catch (e) {
      result.errors.push({
        company: position.name,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}
