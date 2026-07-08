"use client";

// Logo spółki + fallback awatar z inicjałami — bez layout-shiftu (kontener
// zawsze ma finalny rozmiar) i bez pustego miejsca (zawsze coś się renderuje).
// "use client" jest potrzebny do onError na <img>, który przełącza z logo na
// awatar, gdy plik zniknął z cache'u/serwer zwrócił 404 (kalka podejścia
// znanego z innych "use client" komponentów w projekcie).
//
// Kolor awatara: deterministyczny hash tickera → paleta kategoryczna
// `--color-cat-*` z globals.css (te same tokeny co AllocationDonut, jedno
// źródło prawdy, czytelne w light/dark). Tekst na tle: nowy token
// `--color-cat-ink` (dodany do globals.css razem z tym komponentem) —
// odwrotny w Dniu/Wieczorze, bo paleta kategoryczna ma odwróconą jasność
// między motywami (patrz komentarze przy `--color-cat-ink` w globals.css).

import { useState } from "react";

const AVATAR_PALETTE = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
  "var(--color-cat-6)",
  "var(--color-cat-7)",
  "var(--color-cat-8)",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initialsFor(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  return t.slice(0, 2) || "??";
}

const SIZES: Record<"sm" | "md", { px: number; box: string; text: string }> = {
  sm: { px: 20, box: "h-5 w-5", text: "text-[9px]" },
  md: { px: 32, box: "h-8 w-8", text: "text-[13px]" },
};

export function CompanyLogo({
  ticker,
  name,
  companyId,
  hasLogo,
  size = "sm",
}: {
  ticker: string;
  name: string;
  companyId: number;
  hasLogo: boolean;
  size?: "sm" | "md";
}) {
  const [failed, setFailed] = useState(false);
  const dims = SIZES[size];

  if (hasLogo && !failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface2 ${dims.box}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- małe logo
            serwowane z lokalnego cache'u (/api/companies/[id]/logo); next/image
            (optymalizacja/CDN) to zbędny narzut dla już-cache'owanych 128×128
            PNG, patrz "Non-goals" w docs/plans/ikonki-spolek.md. */}
        <img
          src={`/api/companies/${companyId}/logo`}
          alt={`Logo ${name}`}
          width={dims.px}
          height={dims.px}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }

  const color = AVATAR_PALETTE[hashString(ticker.toUpperCase()) % AVATAR_PALETTE.length];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold uppercase tracking-tight ${dims.box} ${dims.text}`}
      style={{ background: color, color: "var(--color-cat-ink)" }}
      title={name}
    >
      {initialsFor(ticker)}
    </span>
  );
}
