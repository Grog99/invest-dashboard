"use client";

// Wykres świecowy OHLC + wolumen (lightweight-charts v5). Struktura
// (dwa useEffect: montaż/cleanup wykresu, dane/cleanup serii) wzorowana
// na AreaChart.tsx — celowo osobny komponent, bo AreaChart.tsx jest
// współdzielony z dashboardem i nie może się zmienić.

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useThemeColors } from "@/components/ThemeProvider";

export interface CandlePoint {
  time: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

export function CandleChart({
  data,
  height = 280,
  valueFormatter,
}: {
  data: CandlePoint[];
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const formatterRef = useRef(valueFormatter);
  const colors = useThemeColors();

  useEffect(() => {
    formatterRef.current = valueFormatter;
  }, [valueFormatter]);

  // Mount-only: tworzy instancję wykresu. Kolory poziomu wykresu (siatka,
  // osie, crosshair) NIE są tu ustawiane na sztywno — zależą od motywu i są
  // aktualizowane w osobnym efekcie niżej (`chart.applyOptions`), analogicznie
  // do AreaChart.tsx.
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
          formatterRef.current
            ? formatterRef.current(p)
            : new Intl.NumberFormat("pl-PL", {
                maximumFractionDigits: 2,
              }).format(p),
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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.pos,
      downColor: colors.neg,
      borderUpColor: colors.pos,
      borderDownColor: colors.neg,
      wickUpColor: colors.pos,
      wickDownColor: colors.neg,
      priceLineVisible: false,
    });
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.25 },
    });
    // Bary z null OHLC (Yahoo) degradują do "doji" na poziomie close,
    // zamiast wywalać setData.
    candleSeries.setData(
      data.map((b) => ({
        // Daty YYYY-MM-DD są wspierane bezpośrednio jako BusinessDay.
        time: b.time as unknown as UTCTimestamp,
        open: b.open ?? b.close,
        high: b.high ?? b.close,
        low: b.low ?? b.close,
        close: b.close,
      }))
    );

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(
      data.map((b) => ({
        time: b.time as unknown as UTCTimestamp,
        value: b.volume ?? 0,
        color:
          b.close >= (b.open ?? b.close)
            ? `${colors.pos}80`
            : `${colors.neg}80`,
      }))
    );

    chart.timeScale().fitContent();

    return () => {
      try {
        chart.removeSeries(candleSeries);
      } catch {
        // wykres mógł już zostać usunięty
      }
      try {
        chart.removeSeries(volumeSeries);
      } catch {
        // wykres mógł już zostać usunięty
      }
    };
  }, [data, colors]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
