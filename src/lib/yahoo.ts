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
  // Uwaga: Number(null) === 0 (nie NaN!), więc bez tej bramki Yahoo'owe null-e
  // w tablicach OHLC/close zamieniały się w 0 zamiast zostać odfiltrowane —
  // stąd fałszywe świece z close=0 w bazie (patrz strażnik przy budowie bars).
  if (v === null || v === undefined) return null;
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
    // Odrzucamy null (dzień bez notowań) ORAZ <= 0: Yahoo potrafi oddać 0/null
    // na trailing-świecy bieżącej/nienotowanej sesji. Zerowy close psuł wycenę
    // portfela (akcje × 0 = 0 zł na wykresie) oraz prev_close (dzienna zmiana =
    // cała pozycja). Kurs akcji nigdy nie jest 0, więc 0 = brak danych.
    if (close === null || close <= 0) continue;
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

// Sugerowany symbol Yahoo na podstawie tickera, rynku i typu instrumentu.
// INDEX ma inne konwencje niż STOCK/ETF: GPW nadal ".WA" (bez karetki, np.
// "WIG.WA"), ale USA/OTHER dostają prefiks "^" (np. "^GSPC", "^NDX") —
// zweryfikowane empirycznie w docs/plans/obsluga-etf-indeksy.md.
export function suggestQuoteSymbol(
  ticker: string,
  market: string,
  type: string = "STOCK"
): string {
  const t = ticker.trim().toUpperCase();
  if (type === "INDEX") {
    if (market === "GPW") return t.endsWith(".WA") ? t : `${t}.WA`;
    return t.startsWith("^") ? t : `^${t}`;
  }
  if (market === "GPW") return t.endsWith(".WA") ? t : `${t}.WA`;
  return t;
}
