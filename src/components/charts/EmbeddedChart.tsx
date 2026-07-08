"use client";

// Osadzony wykres w treści Markdown (feature 5.2, blok
// ```chart <SYMBOL> [ZAKRES]```). Pobiera dane samodzielnie klienckim
// fetchem — Markdown.tsx renderuje się zarówno w podglądzie edytora notatki,
// jak i w streamowanych odpowiedziach AiChat, więc nie ma serwera, który
// mógłby wstrzyknąć propsy z barami.

import { useEffect, useState } from "react";
import { PriceChart, type RangeKey } from "./PriceChart";
import type { CandlePoint } from "./CandleChart";

type State =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "empty"; ticker: string }
  | { status: "ready"; ticker: string; currency: string; bars: CandlePoint[] }
  | { status: "error" };

export function EmbeddedChart({
  symbol,
  initialRange,
}: {
  symbol: string;
  initialRange?: RangeKey;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  // Walidacja wzorca przed fetchem — ograniczenie szumu (zbędne 404), gdyby
  // ten komponent renderował się na niepełnej/uszkodzonej treści. Czysta
  // wartość wyliczana przy renderze (bez setState) — instancja komponentu
  // jest remontowana przez `key={symbol}` w Markdown.tsx, gdy identyfikator
  // się zmienia, więc initial state ("loading") jest zawsze świeży.
  const patternValid = /^[A-Za-z0-9._^-]{1,20}$/.test(symbol.trim());

  useEffect(() => {
    if (!patternValid) return;
    let cancelled = false;

    fetch(`/api/quotes/chart?symbol=${encodeURIComponent(symbol)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setState({ status: "not_found" });
          return;
        }
        if (!res.ok) {
          setState({ status: "error" });
          return;
        }
        const data = (await res.json()) as {
          ticker: string;
          currency: string;
          bars: CandlePoint[];
        };
        if (data.bars.length === 0) {
          setState({ status: "empty", ticker: data.ticker });
        } else {
          setState({
            status: "ready",
            ticker: data.ticker,
            currency: data.currency,
            bars: data.bars,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, patternValid]);

  return (
    <div className="my-3 w-full max-w-full overflow-hidden rounded-lg border border-border p-2 sm:p-3">
      {!patternValid && (
        <p className="text-[13px] text-muted">
          Nie znaleziono spółki dla symbolu {symbol} — dodaj ją do aplikacji.
        </p>
      )}
      {patternValid && state.status === "loading" && (
        <p className="text-[13px] text-muted">Ładowanie wykresu…</p>
      )}
      {patternValid && state.status === "not_found" && (
        <p className="text-[13px] text-muted">
          Nie znaleziono spółki dla symbolu {symbol} — dodaj ją do aplikacji.
        </p>
      )}
      {state.status === "error" && (
        <p className="text-[13px] text-muted">
          Nie udało się wczytać wykresu dla {symbol}.
        </p>
      )}
      {state.status === "empty" && (
        <p className="text-[13px] text-muted">
          Brak danych historycznych dla {state.ticker} — odśwież notowania.
        </p>
      )}
      {state.status === "ready" && (
        <>
          <div className="mb-1 text-[12px] font-medium text-muted">
            {state.ticker}
          </div>
          <PriceChart
            data={state.bars}
            currency={state.currency}
            initialRange={initialRange}
            height={220}
          />
        </>
      )}
    </div>
  );
}
