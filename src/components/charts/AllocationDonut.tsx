"use client";

// Alokacja portfela — donut z legendą (ticker, udział, wartość).
// Kolory: kategoryczna paleta ze zmiennych CSS `--color-cat-*` (jedno źródło
// prawdy w globals.css, dark + light), stała kolejność slotów; "Inne" = szarość.
//
// Odstępstwo od planu: zamiast `useThemeColors()` (odczyt przez
// getComputedStyle, ze snapshotowym fallbackiem "dark" na SSR) używamy tu
// bezpośrednich referencji `var(--color-cat-N)`. Powód: ta strona (`page.tsx`)
// jest `force-dynamic` i renderuje ten komponent po stronie serwera z realnymi
// danymi; lista legendy poniżej to zwykły JSX (poza `ResponsiveContainer`,
// który na SSR nie renderuje swoich dzieci, bo nie zna jeszcze wymiarów), więc
// TA lista faktycznie trafia do HTML-a z serwera. Gdyby `colorFor` zwracał
// hex z `useThemeColors()`, na SSR zawsze dostalibyśmy fallback "dark" —
// przy zapisanym motywie jasnym kolor `style` w SSR HTML różniłby się od
// kolorów po hydratacji (prawdziwy odczyt `getComputedStyle` w motywie
// light), co jest dokładnie ostrzeżeniem hydration mismatch, którego kryteria
// akceptacji zabraniają. `var(--color-cat-N)` rozwiązuje się identycznie po
// obu stronach (sama nazwa zmiennej w atrybucie/stylu), a przeglądarka
// podstawia właściwą wartość przez kaskadę na `<html data-theme>` — SSR i
// klient są więc zawsze zgodne, bez potrzeby JS-owego snapshotu czy
// przerenderowania przy przełączeniu motywu. `fill`/`stroke` w SVG (recharts)
// i `background` w zwykłym `style` obsługują `var()` tak samo jak reszta CSS.

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { fmtMoney } from "@/lib/format";
import { resolveColorBackground } from "@/lib/companyColor";

const PALETTE = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
  "var(--color-cat-6)",
  "var(--color-cat-7)",
  "var(--color-cat-8)",
];
const OTHER_COLOR = "var(--color-cat-other)";
const STROKE_COLOR = "var(--color-surface)";
const MAX_SLICES = 7;

export interface AllocationSlice {
  name: string;
  value: number; // PLN
  // Własny kolor spółki (token presetu albo hex) — nadpisuje slot z PALETTE
  // gdy ustawiony, patrz colorFor(). "Inne" nigdy nie ma koloru (zawsze szare).
  color?: string | null;
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

  // Kolor spółki nadpisuje slot palety tylko gdy ustawiony i prawidłowy;
  // "Inne" (bez color) zawsze zostaje szare, niezależnie od slotu i.
  const colorFor = (s: AllocationSlice, i: number) =>
    s.name === "Inne"
      ? OTHER_COLOR
      : (resolveColorBackground(s.color) ?? PALETTE[i % PALETTE.length]);

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
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke={STROKE_COLOR}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s, i) => (
                <Cell key={s.name} fill={colorFor(s, i)} />
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
                style={{ background: colorFor(s, i) }}
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
