// Klient Yahoo Finance (nieoficjalne API v8/chart) — notowania bieżące
// i historia dzienna w jednym zapytaniu. GPW = sufiks ".WA" (np. PKN.WA),
// USA = sam ticker (np. AAPL).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface DailyBar {
  date: string; // YYYY-MM-DD w strefie giełdy
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export interface ChartResult {
  currency: string | null;
  price: number | null; // regularMarketPrice
  marketDate: string | null; // data ostatniego notowania (YYYY-MM-DD)
  marketTime: string | null; // godzina HH:MM w strefie giełdy
  bars: DailyBar[];
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// fromDate: początek pobieranej historii (YYYY-MM-DD); brak = pełna historia.
// Uwaga: parametr "range=max" zwraca dane MIESIĘCZNE mimo interval=1d —
// dlatego zawsze używamy period1/period2, które dają pełne dane dzienne.
export async function fetchChart(
  symbol: string,
  fromDate?: string
): Promise<ChartResult> {
  const period1 = fromDate
    ? Math.floor(new Date(fromDate + "T00:00:00Z").getTime() / 1000)
    : 0;
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?period1=${period1}&period2=${period2}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 404) {
    throw new Error(
      `Nieznany symbol "${symbol}" w Yahoo Finance — sprawdź symbol notowań (GPW: TICKER.WA).`
    );
  }
  if (res.status === 429) {
    throw new Error(
      "Yahoo Finance: przekroczony limit zapytań — spróbuj ponownie za chwilę."
    );
  }
  if (!res.ok) throw new Error(`Yahoo Finance: HTTP ${res.status}`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) {
    throw new Error(
      data?.chart?.error?.description ?? `Brak danych dla "${symbol}".`
    );
  }

  const meta = result.meta ?? {};
  const gmtoffset = Number(meta.gmtoffset ?? 0);
  const toLocalDate = (epoch: number) =>
    new Date((epoch + gmtoffset) * 1000).toISOString().slice(0, 10);
  const toLocalTime = (epoch: number) =>
    new Date((epoch + gmtoffset) * 1000).toISOString().slice(11, 16);

  const timestamps: number[] = Array.isArray(result.timestamp)
    ? result.timestamp
    : [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars: DailyBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = num(quote.close?.[i]);
    if (close === null) continue; // dni bez notowań
    bars.push({
      date: toLocalDate(timestamps[i]),
      open: num(quote.open?.[i]),
      high: num(quote.high?.[i]),
      low: num(quote.low?.[i]),
      close,
      volume: num(quote.volume?.[i]),
    });
  }
  // Yahoo potrafi zwrócić dwa wpisy z tą samą datą (sesja bieżąca) — zostawiamy ostatni.
  const byDate = new Map<string, DailyBar>();
  for (const b of bars) byDate.set(b.date, b);

  const marketTime = num(meta.regularMarketTime);
  return {
    currency: typeof meta.currency === "string" ? meta.currency : null,
    price: num(meta.regularMarketPrice),
    marketDate: marketTime !== null ? toLocalDate(marketTime) : null,
    marketTime: marketTime !== null ? toLocalTime(marketTime) : null,
    bars: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
  };
}

// Sugerowany symbol Yahoo na podstawie tickera i rynku.
export function suggestQuoteSymbol(ticker: string, market: string): string {
  const t = ticker.trim().toUpperCase();
  if (market === "GPW") return t.endsWith(".WA") ? t : `${t}.WA`;
  return t;
}
