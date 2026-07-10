// Pozycje CFD — POZA silnikiem FIFO/PIT-38 (src/lib/portfolio.ts), osobny
// prosty byt (patrz docs/plans/pozycja-cfd.md). Hybrydowy P&L: override_pnl
// (jeśli ustawiony) wygrywa nad wszystkim; inaczej wzór z efektywnej ceny
// (override_price ?? quote_price), do którego doliczany jest ręczny,
// skumulowany swap (swap_pln — patrz docs/plans/manualny-swap-cfd.md).
// Gałąź override_pnl ("wg XTB") traktuje wartość jako już finalną i swapu
// NIE dolicza. Ekspozycja jest tylko informacyjna — NIE wchodzi do sumy
// portfela (dźwignia zawyżyłaby majątek wielokrotnie) i swap jej nie dotyczy.

import { db, cfdPositions, type CfdPosition } from "@/db";

export type CfdPnlSource = "XTB" | "YAHOO" | "NONE";

export interface CfdView {
  position: CfdPosition;
  sign: 1 | -1;
  effectivePrice: number | null; // override_price ?? quote_price
  pnl: number | null;
  exposure: number | null; // wolumen × cena_efektywna × wartość_punktu — niesumowana
  pnlSource: CfdPnlSource;
}

export interface CfdSummary {
  positions: CfdView[];
  totalCfdPnlPln: number;
}

export function computeCfdPositions(): CfdSummary {
  const rows = db.select().from(cfdPositions).all();

  const positions: CfdView[] = rows.map((position) => {
    const sign: 1 | -1 = position.direction === "SHORT" ? -1 : 1;
    const effectivePrice = position.overridePrice ?? position.quotePrice ?? null;

    let pnl: number | null;
    let pnlSource: CfdPnlSource;
    if (position.overridePnl !== null && position.overridePnl !== undefined) {
      // Nadpisanie P&L "wg XTB" wygrywa nad wszystkim, nawet gdy nie ma ceny.
      pnl = position.overridePnl;
      pnlSource = "XTB";
    } else if (effectivePrice !== null) {
      pnl =
        (effectivePrice - position.openPrice) *
          sign *
          position.volume *
          position.pointValue +
        (position.swapPln ?? 0);
      pnlSource = position.overridePrice !== null && position.overridePrice !== undefined
        ? "XTB"
        : "YAHOO";
    } else {
      pnl = null;
      pnlSource = "NONE";
    }

    const exposure =
      effectivePrice !== null
        ? position.volume * effectivePrice * position.pointValue
        : null;

    return { position, sign, effectivePrice, pnl, exposure, pnlSource };
  });

  // Najnowsze pozycje pierwsze — spójne z porządkiem list transakcji/dywidend.
  positions.sort((a, b) => b.position.id - a.position.id);

  return {
    positions,
    totalCfdPnlPln: positions.reduce((s, p) => s + (p.pnl ?? 0), 0),
  };
}
