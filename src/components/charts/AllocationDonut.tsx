"use client";

// Alokacja portfela — donut z legendą (ticker, udział, wartość).
// Kolory: kategoryczna paleta dark w stałej kolejności slotów; "Inne" = szarość.

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmtMoney } from "@/lib/format";

const PALETTE = [
  "#3987e5",
  "#199e70",
  "#c98500",
  "#008300",
  "#9085e9",
  "#e66767",
  "#d55181",
  "#d95926",
];
const OTHER_COLOR = "#898781";
const MAX_SLICES = 7;

export interface AllocationSlice {
  name: string;
  value: number; // PLN
}

function foldSlices(data: AllocationSlice[]): AllocationSlice[] {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  if (sorted.length <= MAX_SLICES + 1) return sorted;
  const head = sorted.slice(0, MAX_SLICES);
  const rest = sorted.slice(MAX_SLICES);
  return [
    ...head,
    { name: "Inne", value: rest.reduce((s, d) => s + d.value, 0) },
  ];
}

export function AllocationDonut({ data }: { data: AllocationSlice[] }) {
  const slices = foldSlices(data.filter((d) => d.value > 0));
  const total = slices.reduce((s, d) => s + d.value, 0);
  if (total <= 0) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-muted">
        Brak wycenionych pozycji.
      </div>
    );
  }

  const colorFor = (name: string, i: number) =>
    name === "Inne" ? OTHER_COLOR : PALETTE[i % PALETTE.length];

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="h-[190px] w-[190px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={90}
              startAngle={90}
              endAngle={-270}
              stroke="#1a1a19"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s, i) => (
                <Cell key={s.name} fill={colorFor(s.name, i)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0];
                const v = Number(p.value) || 0;
                return (
                  <div className="rounded-lg border border-border2 bg-surface2 px-2.5 py-1.5 text-[12px] shadow-lg">
                    <div className="font-medium text-ink">{p.name}</div>
                    <div className="text-ink2">
                      {fmtMoney(v)} · {((v / total) * 100).toFixed(1)}%
                    </div>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-40 flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <li
            key={s.name}
            className="flex items-center justify-between gap-3 text-[12px]"
          >
            <span className="flex items-center gap-2 text-ink2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: colorFor(s.name, i) }}
                aria-hidden
              />
              {s.name}
            </span>
            <span className="tabular-nums text-ink">
              {((s.value / total) * 100).toFixed(1)}%
              <span className="ml-2 text-muted">{fmtMoney(s.value)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
