"use client";

// Generyczny wykres warstwowy (lightweight-charts v5) — jedna seria,
// crosshair + tooltipy osi wbudowane w silnik wykresu.

import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

export interface AreaPoint {
  time: string; // YYYY-MM-DD
  value: number;
}

export function AreaChart({
  data,
  color = "#3987e5",
  height = 280,
  valueFormatter,
}: {
  data: AreaPoint[];
  color?: string;
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const formatterRef = useRef(valueFormatter);
  formatterRef.current = valueFormatter;

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

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      lineWidth: 2,
      topColor: `${color}40`,
      bottomColor: `${color}05`,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    series.setData(
      data.map((d) => ({
        // Daty YYYY-MM-DD są wspierane bezpośrednio jako BusinessDay.
        time: d.time as unknown as UTCTimestamp,
        value: d.value,
      }))
    );
    chart.timeScale().fitContent();

    return () => {
      try {
        chart.removeSeries(series);
      } catch {
        // wykres mógł już zostać usunięty
      }
    };
  }, [data, color]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
