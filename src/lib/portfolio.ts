// Silnik portfela: pozycje z transakcji, FIFO dla zysku zrealizowanego,
// przeliczenia na PLN po kursach NBP (D-1 dla podatku, bieżący dla wyceny),
// dywidendy oraz agregacja roczna pod PIT-38.

import {
  db,
  companies,
  transactions,
  dividends,
  quotesLatest,
  quotesDaily,
  fxRates,
  type Company,
  type Transaction,
} from "@/db";
import { and, asc, eq, gt, gte } from "drizzle-orm";
import { getFxRateBefore, getLatestFxRate } from "./nbp";

export interface Holding {
  company: Company;
  shares: number;
  avgCost: number; // średni koszt/akcję z FIFO (z prowizją), waluta spółki
  costBasis: number; // waluta spółki
  costBasisPln: number | null;
  price: number | null;
  prevClose: number | null;
  quoteUpdatedAt: string | null;
  value: number | null; // waluta spółki
  valuePln: number | null;
  unrealized: number | null;
  unrealizedPln: number | null;
  unrealizedPct: number | null;
  dayChangePln: number | null;
  dayChangePct: number | null;
}

export interface RealizedSale {
  companyId: number;
  ticker: string;
  currency: string;
  date: string;
  quantity: number;
  proceeds: number; // waluta, po odjęciu prowizji sprzedaży
  cost: number; // waluta, z prowizją zakupu (FIFO)
  pl: number;
  proceedsPln: number | null;
  costPln: number | null;
  plPln: number | null;
}

export interface DividendRow {
  id: number;
  companyId: number;
  ticker: string;
  currency: string;
  date: string;
  amount: number;
  taxWithheld: number;
  amountPln: number | null;
  taxWithheldPln: number | null;
  note: string | null;
}

export interface PortfolioSummary {
  holdings: Holding[];
  totalValuePln: number;
  totalCostPln: number;
  totalUnrealizedPln: number;
  totalDayChangePln: number;
  realizedSales: RealizedSale[];
  totalRealizedPln: number;
  dividendRows: DividendRow[];
  totalDividendsPln: number;
  warnings: string[];
}

interface Lot {
  qty: number;
  costPerShare: number; // cena + prowizja/akcję
  fxBuy: number | null; // kurs D-1 z dnia zakupu
}

function sortTx(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.id - b.id;
}

export function computePortfolio(): PortfolioSummary {
  const allCompanies = db.select().from(companies).all();
  const allTx = db.select().from(transactions).all();
  const allDiv = db.select().from(dividends).all();
  const latestQuotes = new Map(
    db.select().from(quotesLatest).all().map((q) => [q.companyId, q])
  );

  const txByCompany = new Map<number, Transaction[]>();
  for (const tx of allTx) {
    const arr = txByCompany.get(tx.companyId) ?? [];
    arr.push(tx);
    txByCompany.set(tx.companyId, arr);
  }

  const warnings: string[] = [];
  const holdings: Holding[] = [];
  const realizedSales: RealizedSale[] = [];
  const fxWarned = new Set<string>();

  const warnFx = (currency: string) => {
    if (currency !== "PLN" && !fxWarned.has(currency)) {
      fxWarned.add(currency);
      warnings.push(
        `Brak kursu NBP dla ${currency} — odśwież notowania, aby pobrać kursy walut.`
      );
    }
  };

  for (const company of allCompanies) {
    if (company.type === "INDEX") continue; // indeks = tylko obserwacja, bez pozycji/P&L
    const txs = (txByCompany.get(company.id) ?? []).slice().sort(sortTx);
    if (txs.length === 0) continue;

    const lots: Lot[] = [];

    for (const tx of txs) {
      if (tx.type === "BUY") {
        const fxBuy = getFxRateBefore(company.currency, tx.date);
        if (fxBuy === null) warnFx(company.currency);
        lots.push({
          qty: tx.quantity,
          costPerShare: tx.price + (tx.quantity > 0 ? tx.commission / tx.quantity : 0),
          fxBuy,
        });
      } else if (tx.type === "SELL") {
        const fxSell = getFxRateBefore(company.currency, tx.date);
        if (fxSell === null) warnFx(company.currency);

        let toSell = tx.quantity;
        let cost = 0;
        let costPln: number | null = 0;
        while (toSell > 1e-9 && lots.length > 0) {
          const lot = lots[0];
          const take = Math.min(lot.qty, toSell);
          cost += take * lot.costPerShare;
          if (costPln !== null && lot.fxBuy !== null) {
            costPln += take * lot.costPerShare * lot.fxBuy;
          } else {
            costPln = null;
          }
          lot.qty -= take;
          toSell -= take;
          if (lot.qty <= 1e-9) lots.shift();
        }
        if (toSell > 1e-9) {
          warnings.push(
            `${company.ticker}: sprzedaż ${tx.date} przekracza posiadane akcje o ${toSell} szt. — sprawdź transakcje.`
          );
        }

        const soldQty = tx.quantity - Math.max(0, toSell);
        const proceeds = soldQty * tx.price - tx.commission;
        const proceedsPln = fxSell !== null ? proceeds * fxSell : null;
        realizedSales.push({
          companyId: company.id,
          ticker: company.ticker,
          currency: company.currency,
          date: tx.date,
          quantity: soldQty,
          proceeds,
          cost,
          pl: proceeds - cost,
          proceedsPln,
          costPln,
          plPln:
            proceedsPln !== null && costPln !== null
              ? proceedsPln - costPln
              : null,
        });
      }
    }

    const shares = lots.reduce((s, l) => s + l.qty, 0);
    if (shares <= 1e-9) continue; // pozycja zamknięta — nie pokazujemy w holdingach

    const costBasis = lots.reduce((s, l) => s + l.qty * l.costPerShare, 0);
    let costBasisPln: number | null = 0;
    for (const l of lots) {
      if (costBasisPln === null) break;
      costBasisPln = l.fxBuy === null ? null : costBasisPln + l.qty * l.costPerShare * l.fxBuy;
    }

    const quote = latestQuotes.get(company.id);
    const fxNow = getLatestFxRate(company.currency);
    if (fxNow === null) warnFx(company.currency);

    const price = quote?.price ?? null;
    const value = price !== null ? shares * price : null;
    const valuePln = value !== null && fxNow !== null ? value * fxNow : null;
    const unrealized = value !== null ? value - costBasis : null;
    const unrealizedPln =
      valuePln !== null && costBasisPln !== null ? valuePln - costBasisPln : null;

    const prevClose = quote?.prevClose ?? null;
    const dayChange =
      price !== null && prevClose !== null ? (price - prevClose) * shares : null;

    holdings.push({
      company,
      shares,
      avgCost: costBasis / shares,
      costBasis,
      costBasisPln,
      price,
      prevClose,
      quoteUpdatedAt: quote?.updatedAt ?? null,
      value,
      valuePln,
      unrealized,
      unrealizedPln,
      unrealizedPct: costBasis > 0 && unrealized !== null ? (unrealized / costBasis) * 100 : null,
      dayChangePln: dayChange !== null && fxNow !== null ? dayChange * fxNow : null,
      dayChangePct:
        price !== null && prevClose !== null && prevClose > 0
          ? ((price - prevClose) / prevClose) * 100
          : null,
    });
  }

  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  const dividendRows: DividendRow[] = allDiv
    .map((d) => {
      const company = companyById.get(d.companyId);
      const currency = company?.currency ?? "PLN";
      const fx = getFxRateBefore(currency, d.date);
      if (fx === null) warnFx(currency);
      return {
        id: d.id,
        companyId: d.companyId,
        ticker: company?.ticker ?? "?",
        currency,
        date: d.date,
        amount: d.amount,
        taxWithheld: d.taxWithheld,
        amountPln: fx !== null ? d.amount * fx : null,
        taxWithheldPln: fx !== null ? d.taxWithheld * fx : null,
        note: d.note,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  holdings.sort((a, b) => (b.valuePln ?? 0) - (a.valuePln ?? 0));
  realizedSales.sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    holdings,
    totalValuePln: holdings.reduce((s, h) => s + (h.valuePln ?? 0), 0),
    totalCostPln: holdings.reduce((s, h) => s + (h.costBasisPln ?? 0), 0),
    totalUnrealizedPln: holdings.reduce((s, h) => s + (h.unrealizedPln ?? 0), 0),
    totalDayChangePln: holdings.reduce((s, h) => s + (h.dayChangePln ?? 0), 0),
    realizedSales,
    totalRealizedPln: realizedSales.reduce((s, r) => s + (r.plPln ?? 0), 0),
    dividendRows,
    totalDividendsPln: dividendRows.reduce((s, d) => s + (d.amountPln ?? 0), 0),
    warnings,
  };
}

export interface YearlyTaxRow {
  year: number;
  proceedsPln: number; // przychód ze sprzedaży
  costsPln: number; // koszty uzyskania
  incomePln: number; // dochód (strata gdy ujemny)
  tax19: number; // 19% podatek od dochodu (0 przy stracie)
  divGrossPln: number;
  divWithheldPln: number;
  divTaxDuePln: number; // 19% od dywidend brutto minus podatek pobrany (min 0)
}

export function computeYearlyTax(summary: PortfolioSummary): YearlyTaxRow[] {
  const years = new Map<number, YearlyTaxRow>();
  const rowFor = (year: number): YearlyTaxRow => {
    let row = years.get(year);
    if (!row) {
      row = {
        year,
        proceedsPln: 0,
        costsPln: 0,
        incomePln: 0,
        tax19: 0,
        divGrossPln: 0,
        divWithheldPln: 0,
        divTaxDuePln: 0,
      };
      years.set(year, row);
    }
    return row;
  };

  for (const sale of summary.realizedSales) {
    const row = rowFor(Number(sale.date.slice(0, 4)));
    row.proceedsPln += sale.proceedsPln ?? 0;
    row.costsPln += sale.costPln ?? 0;
  }
  for (const div of summary.dividendRows) {
    const row = rowFor(Number(div.date.slice(0, 4)));
    row.divGrossPln += div.amountPln ?? 0;
    row.divWithheldPln += div.taxWithheldPln ?? 0;
  }

  const result = [...years.values()].sort((a, b) => b.year - a.year);
  for (const row of result) {
    row.incomePln = row.proceedsPln - row.costsPln;
    row.tax19 = row.incomePln > 0 ? Math.round(row.incomePln * 0.19 * 100) / 100 : 0;
    row.divTaxDuePln = Math.max(0, row.divGrossPln * 0.19 - row.divWithheldPln);
    row.divTaxDuePln = Math.round(row.divTaxDuePln * 100) / 100;
  }
  return result;
}

// Historia wartości portfela w PLN (do wykresu na dashboardzie).
export function portfolioValueHistory(
  days = 365
): { date: string; value: number }[] {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  const startISO = start.toISOString().slice(0, 10);

  const allCompanies = db.select().from(companies).all();
  const allTx = db
    .select()
    .from(transactions)
    .orderBy(asc(transactions.date), asc(transactions.id))
    .all();
  if (allTx.length === 0) return [];

  // Świece dzienne w zakresie (z buforem na dni bez notowań).
  const bars = db
    .select()
    .from(quotesDaily)
    .where(gte(quotesDaily.date, startISO))
    .orderBy(asc(quotesDaily.date))
    .all();
  if (bars.length === 0) return [];

  const barsByCompany = new Map<number, { date: string; close: number }[]>();
  const allDates = new Set<string>();
  for (const b of bars) {
    const arr = barsByCompany.get(b.companyId) ?? [];
    arr.push({ date: b.date, close: b.close });
    barsByCompany.set(b.companyId, arr);
    allDates.add(b.date);
  }
  const dates = [...allDates].sort();

  // Zmiany liczby akcji per spółka — posortowana lista delt (transakcja może
  // wypaść w dzień bez notowań, więc aplikujemy wszystkie delty <= data świecy).
  const txDeltas = new Map<number, { date: string; delta: number }[]>();
  const sharesBefore = new Map<number, number>(); // stan na dzień przed startISO
  for (const tx of allTx) {
    const delta = tx.type === "BUY" ? tx.quantity : -tx.quantity;
    if (tx.date < startISO) {
      sharesBefore.set(tx.companyId, (sharesBefore.get(tx.companyId) ?? 0) + delta);
    } else {
      const arr = txDeltas.get(tx.companyId) ?? [];
      arr.push({ date: tx.date, delta }); // allTx posortowane rosnąco po dacie
      txDeltas.set(tx.companyId, arr);
    }
  }

  // Kursy walut posortowane rosnąco per waluta — wskaźnikowe przejście.
  const fxCache = new Map<string, { dates: string[]; rates: number[] }>();
  const fxOnOrBefore = (currency: string, date: string): number | null => {
    if (currency === "PLN") return 1;
    let entry = fxCache.get(currency);
    if (!entry) {
      const all = db
        .select()
        .from(fxRates)
        .where(eq(fxRates.currency, currency))
        .orderBy(asc(fxRates.date))
        .all();
      entry = { dates: all.map((r) => r.date), rates: all.map((r) => r.rate) };
      fxCache.set(currency, entry);
    }
    // binarne wyszukiwanie ostatniego kursu <= date
    let lo = 0,
      hi = entry.dates.length - 1,
      ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (entry.dates[mid] <= date) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans >= 0 ? entry.rates[ans] : null;
  };

  const state = allCompanies.map((c) => ({
    company: c,
    shares: sharesBefore.get(c.id) ?? 0,
    pending: txDeltas.get(c.id) ?? [],
    txIdx: 0,
    bars: barsByCompany.get(c.id) ?? [],
    barIdx: -1,
    lastClose: null as number | null,
  }));

  const series: { date: string; value: number }[] = [];
  for (const date of dates) {
    let total = 0;
    for (const s of state) {
      while (s.txIdx < s.pending.length && s.pending[s.txIdx].date <= date) {
        s.shares += s.pending[s.txIdx].delta;
        s.txIdx++;
      }
      while (s.barIdx + 1 < s.bars.length && s.bars[s.barIdx + 1].date <= date) {
        s.barIdx++;
        // Pomijamy zerowe/ujemne close (glitch Yahoo utrwalony w bazie) —
        // przenosimy ostatni sensowny kurs zamiast zerować wartość portfela.
        if (s.bars[s.barIdx].close > 0) s.lastClose = s.bars[s.barIdx].close;
      }
      if (s.shares > 1e-9 && s.lastClose !== null) {
        const fx = fxOnOrBefore(s.company.currency.toUpperCase(), date);
        total += s.shares * s.lastClose * (fx ?? 0);
      }
    }
    series.push({ date, value: Math.round(total * 100) / 100 });
  }
  return series;
}

// Historia zamknięć jednej spółki — odpowiednik portfolioValueHistory dla
// benchmarku: bez FIFO i bez FX, bo benchmark nie jest przeliczany na PLN
// (porównanie w walucie natywnej, patrz normalizeComparison).
export function benchmarkCloseHistory(
  companyId: number,
  days = 365
): { date: string; close: number }[] {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - days);
  const startISO = start.toISOString().slice(0, 10);

  return db
    .select({ date: quotesDaily.date, close: quotesDaily.close })
    .from(quotesDaily)
    .where(
      and(
        eq(quotesDaily.companyId, companyId),
        gte(quotesDaily.date, startISO),
        gt(quotesDaily.close, 0)
      )
    )
    .orderBy(asc(quotesDaily.date))
    .all();
}

export interface ComparisonSeries {
  portfolio: { time: string; value: number }[];
  benchmark: { time: string; value: number }[];
  baseDate: string | null;
  portfolioReturnPct: number | null;
  benchmarkReturnPct: number | null;
}

const EMPTY_COMPARISON: ComparisonSeries = {
  portfolio: [],
  benchmark: [],
  baseDate: null,
  portfolioReturnPct: null,
  benchmarkReturnPct: null,
};

// Normalizuje obie serie do bazy 100 na pierwszej dacie, na którą OBIE mają
// sensowny (niezerowy) punkt: baseDate = max(pierwsza data, od której portfel
// ma niezerową wartość, pierwsza data benchmarku). portfolio[0] to zawsze
// początek okna 365 dni (portfolioValueHistory zwraca 0 dla dni sprzed
// pierwszej transakcji), więc bazą NIE może być portfolio[0].date — trzeba
// znaleźć pierwszy dzień z realną pozycją. Serie zostają na własnych datach
// (lightweight-charts wyrównuje po czasie), tylko baza (dzielnik) jest
// wspólnie ustalona. Brak nakładania się okresów (lub baza = 0) → obie serie
// puste, żeby uniknąć dzielenia przez błędną/zerową wartość.
export function normalizeComparison(
  portfolio: { date: string; value: number }[],
  benchmark: { date: string; close: number }[]
): ComparisonSeries {
  if (portfolio.length === 0 || benchmark.length === 0) return EMPTY_COMPARISON;

  const portfolioStart = portfolio.find((p) => p.value > 0)?.date;
  if (!portfolioStart) return EMPTY_COMPARISON;

  const baseDate =
    portfolioStart > benchmark[0].date ? portfolioStart : benchmark[0].date;

  const normalize = (
    points: { date: string; value: number }[]
  ): { time: string; value: number }[] => {
    const fromBase = points.filter((p) => p.date >= baseDate);
    if (fromBase.length === 0 || fromBase[0].value === 0) return [];
    const base = fromBase[0].value;
    return fromBase.map((p) => ({ time: p.date, value: (p.value / base) * 100 }));
  };

  const portfolioNorm = normalize(portfolio);
  const benchmarkNorm = normalize(benchmark.map((b) => ({ date: b.date, value: b.close })));
  if (portfolioNorm.length === 0 || benchmarkNorm.length === 0) return EMPTY_COMPARISON;

  return {
    portfolio: portfolioNorm,
    benchmark: benchmarkNorm,
    baseDate,
    portfolioReturnPct: (portfolioNorm[portfolioNorm.length - 1].value / 100 - 1) * 100,
    benchmarkReturnPct: (benchmarkNorm[benchmarkNorm.length - 1].value / 100 - 1) * 100,
  };
}
