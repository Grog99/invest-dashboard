"use client";

// Wykres kursu z przełącznikiem zakresu (filtrowanie po stronie klienta).

import { useMemo, useState } from "react";
import { AreaChart, type AreaPoint } from "./AreaChart";

const RANGES = [
  { key: "3M", months: 3 },
  { key: "1R", months: 12 },
  { key: "3L", months: 36 },
  { key: "MAX", months: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

export function PriceChart({
  data,
  currency,
}: {
  data: AreaPoint[];
  currency: string;
}) {
  const [range, setRange] = useState<RangeKey>("1R");

  const filtered = useMemo(() => {
    const def = RANGES.find((r) => r.key === range);
    if (!def?.months) return data;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - def.months);
    const cutoffISO = cutoff.toISOString().slice(0, 10);
    return data.filter((d) => d.time >= cutoffISO);
  }, [data, range]);

  const fmt = useMemo(() => {
    const nf = new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
    return (v: number) => nf.format(v);
  }, [currency]);

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-muted">
        Brak danych historycznych — odśwież notowania.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex justify-end gap-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              range === r.key
                ? "bg-surface2 text-ink"
                : "text-muted hover:text-ink2"
            }`}
          >
            {r.key}
          </button>
        ))}
      </div>
      <AreaChart data={filtered} valueFormatter={fmt} height={300} />
    </div>
  );
}
