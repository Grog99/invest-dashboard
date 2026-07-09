"use client";

// Logo spółki + fallback awatar z inicjałami — bez layout-shiftu (kontener
// zawsze ma finalny rozmiar) i bez pustego miejsca (zawsze coś się renderuje).
// "use client" jest potrzebny do onError na <img>, który przełącza z logo na
// awatar, gdy plik zniknął z cache'u/serwer zwrócił 404 (kalka podejścia
// znanego z innych "use client" komponentów w projekcie).
//
// Kolor awatara: własny kolor spółki (color), gdy ustawiony, inaczej
// deterministyczny hash tickera → paleta kategoryczna `--color-cat-*` z
// globals.css (te same tokeny co AllocationDonut). Rezolucja tła/tekstu —
// jedno źródło prawdy w src/lib/companyColor.ts (avatarBackground/avatarInk),
// żeby CompanyLogo, badge newsów i AllocationDonut się nie rozjechały.
// Tekst na tle: token `--color-cat-ink` — odwrotny w Dniu/Wieczorze, bo
// paleta kategoryczna ma odwróconą jasność między motywami (patrz komentarze
// przy `--color-cat-ink` w globals.css); dla własnego hexa liczony z
// luminancji (patrz resolveColorInk w companyColor.ts).

import { useState } from "react";
import { avatarBackground, avatarInk } from "@/lib/companyColor";

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
  color,
  size = "sm",
}: {
  ticker: string;
  name: string;
  companyId: number;
  hasLogo: boolean;
  color?: string | null;
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

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-semibold uppercase tracking-tight ${dims.box} ${dims.text}`}
      style={{
        background: avatarBackground(color, ticker),
        color: avatarInk(color),
      }}
      title={name}
    >
      {initialsFor(ticker)}
    </span>
  );
}
