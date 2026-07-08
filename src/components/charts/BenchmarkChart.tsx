"use client";

// Dwie serie liniowe (portfel/benchmark), znormalizowane do bazy 100 —
// struktura 1:1 z CandleChart.tsx (dwa useEffect: montaż/cleanup wykresu,
// dane/cleanup serii); osobny komponent, bo AreaChart.tsx jest współdzielony
// z dashboardem i nie może się zmienić.

import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useThemeColors } from "@/components/ThemeProvider";

export interface NormalizedPoint {
  time: string; // YYYY-MM-DD
  value: number; // znormalizowane, baza = 100
}

export function BenchmarkChart({
  portfolio,
  benchmark,
  portfolioLabel = "Portfel",
  benchmarkLabel,
  height = 280,
}: {
  portfolio: NormalizedPoint[];
  benchmark: NormalizedPoint[];
  portfolioLabel?: string;
  benchmarkLabel: string;
  height?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const colors = useThemeColors();

  // Mount-only: tworzy instancję wykresu, tak jak w CandleChart.tsx.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        fontSize: 11,
      },
      localization: {
        locale: "pl-PL",
        priceFormatter: (p: number) =>
          new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(p),
      },
    });
    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Kolory poziomu wykresu — zależne od motywu, przemalowywane przez
  // applyOptions przy każdej zmianie `colors`, bez odtwarzania wykresu.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: colors.muted,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colors.border },
        horzLines: { color: colors.border },
      },
      rightPriceScale: { borderColor: colors.border2 },
      timeScale: { borderColor: colors.border2, timeVisible: false },
      crosshair: {
        horzLine: { labelBackgroundColor: colors.border2 },
        vertLine: { labelBackgroundColor: colors.border2 },
      },
    });
  }, [colors]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Bez priceScaleId: obie serie na wspólnej domyślnej prawej skali — ma
    // to sens, bo obie są znormalizowane do tej samej bazy 100 (nie PLN).
    const portfolioSeries = chart.addSeries(LineSeries, {
      color: colors.accent,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    portfolioSeries.setData(
      portfolio.map((p) => ({
        time: p.time as unknown as UTCTimestamp,
        value: p.value,
      }))
    );

    const benchmarkSeries = chart.addSeries(LineSeries, {
      color: colors.cat3,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    benchmarkSeries.setData(
      benchmark.map((p) => ({
        time: p.time as unknown as UTCTimestamp,
        value: p.value,
      }))
    );

    chart.timeScale().fitContent();

    return () => {
      try {
        chart.removeSeries(portfolioSeries);
      } catch {
        // wykres mógł już zostać usunięty
      }
      try {
        chart.removeSeries(benchmarkSeries);
      } catch {
        // wykres mógł już zostać usunięty
      }
    };
  }, [portfolio, benchmark, colors]);

  return (
    <div>
      {/* Legenda ręczna — lightweight-charts jej nie ma. Kolory jako surowe
          referencje `var(--color-*)`, NIE `colors.accent/cat3` z hooka: ten
          hook zwraca podczas SSR zaszyty fallback (ciemny motyw), a po
          hydracji realną wartość z `getComputedStyle` — dwie różne wartości
          w tym samym atrybucie `style` to gwarantowany hydration mismatch.
          `var(...)` renderuje się identycznie na serwerze i kliencie;
          przeglądarka rozwiązuje ją dopiero przy malowaniu. */}
      <div className="mb-2 flex items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--color-accent)" }}
          />
          {portfolioLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "var(--color-cat-3)" }}
          />
          {benchmarkLabel}
        </span>
      </div>
      <div ref={containerRef} style={{ height }} className="w-full" />
    </div>
  );
}
