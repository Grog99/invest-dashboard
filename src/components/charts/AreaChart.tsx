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
import { useThemeColors } from "@/components/ThemeProvider";

export interface AreaPoint {
  time: string; // YYYY-MM-DD
  value: number;
}

export function AreaChart({
  data,
  color,
  colorToken = "accent",
  height = 280,
  valueFormatter,
}: {
  data: AreaPoint[];
  color?: string;
  // Token semantyczny użyty, gdy `color` nie jest podany — "ink" daje grubszą,
  // atramentową linię (hero „Wartość portfela" w Rocznik), "accent" to
  // dotychczasowe domyślne zachowanie (np. PriceChart na stronie spółki).
  colorToken?: "accent" | "ink";
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const formatterRef = useRef(valueFormatter);
  useEffect(() => {
    formatterRef.current = valueFormatter;
  }, [valueFormatter]);
  const colors = useThemeColors();
  // Domyślny kolor serii = akcent motywu (lub atrament dla `colorToken="ink"`);
  // przekazany `color` (jeśli jest) ma pierwszeństwo i nie zmienia się przy
  // przełączeniu motywu.
  const seriesColor = color ?? (colorToken === "ink" ? colors.ink : colors.accent);
  const lineWidth: 2 | 3 = colorToken === "ink" ? 3 : 2;

  // Mount-only: tworzy instancję wykresu. Kolory poziomu wykresu (siatka,
  // osie, crosshair) NIE są tu ustawiane na sztywno — zależą od motywu i
  // są aktualizowane w osobnym efekcie niżej (`chart.applyOptions`), żeby
  // przełączenie motywu nie wymagało przetworzenia całego wykresu.
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
  // applyOptions przy każdej zmianie `colors` (czyli przy przełączeniu
  // motywu), bez odtwarzania wykresu.
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

    const series = chart.addSeries(AreaSeries, {
      lineColor: seriesColor,
      lineWidth,
      // Wash pod krzywą jest zawsze tonowany akcentem (nawet gdy sama linia
      // jest atramentem) — spójny "podświetlony papier" pod hero-wykresem.
      topColor: `${colors.accent}29`,
      bottomColor: `${colors.accent}00`,
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
  }, [data, seriesColor, lineWidth, colors.accent]);

  return <div ref={containerRef} style={{ height }} className="w-full" />;
}
