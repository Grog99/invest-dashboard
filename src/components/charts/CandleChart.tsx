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

export interface CandlePoint {
  time: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
}

const COLOR_POS = "#0ca30c"; // --color-pos
const COLOR_NEG = "#e66767"; // --color-neg

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

  useEffect(() => {
    formatterRef.current = valueFormatter;
  }, [valueFormatter]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#898781",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(44,44,42,0.6)" },
        horzLines: { color: "rgba(44,44,42,0.6)" },
      },
      rightPriceScale: { borderColor: "#383835" },
      timeScale: { borderColor: "#383835", timeVisible: false },
      crosshair: {
        horzLine: { labelBackgroundColor: "#383835" },
        vertLine: { labelBackgroundColor: "#383835" },
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

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: COLOR_POS,
      downColor: COLOR_NEG,
      borderUpColor: COLOR_POS,
      borderDownColor: COLOR_NEG,
      wickUpColor: COLOR_POS,
      wickDownColor: COLOR_NEG,
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
            ? "rgba(12,163,12,0.5)"
            : "rgba(230,103,103,0.5)",
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
  }, [data]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
