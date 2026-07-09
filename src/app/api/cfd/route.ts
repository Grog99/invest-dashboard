import { NextRequest, NextResponse } from "next/server";
import { db, cfdPositions } from "@/db";
import { desc, eq } from "drizzle-orm";
import { fetchChart } from "@/lib/yahoo";
import { nowISO } from "@/lib/format";

// Krótka etykieta z symbolu notowań Yahoo, np. "WIG20.WA" → "WIG20",
// "^GSPC" → "GSPC" — CFD nie ma osobnego pola formularza na to, patrz
// docs/plans/pozycja-cfd.md ("Pola" w sekcji "Pliki do zmiany").
function deriveSymbol(quoteSymbol: string): string {
  const cleaned = quoteSymbol.replace(/^\^/, "").replace(/\.[A-Za-z]{1,3}$/, "");
  return cleaned || quoteSymbol;
}

export async function GET() {
  return NextResponse.json({
    positions: db.select().from(cfdPositions).orderBy(desc(cfdPositions.id)).all(),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const direction = body.direction === "SHORT" ? "SHORT" : "LONG";
  const volume = Number(body.volume);
  const openPrice = Number(body.openPrice);
  const pointValue = Number(body.pointValue);
  const openedAt = String(body.openedAt ?? "").trim();
  const quoteSymbol =
    String(body.quoteSymbol ?? "").trim().toUpperCase() || "WIG20.WA";
  const name = String(body.name ?? "").trim() || "CFD WIG20";
  const overridePrice =
    body.overridePrice === undefined ||
    body.overridePrice === null ||
    body.overridePrice === ""
      ? null
      : Number(body.overridePrice);
  const overridePnl =
    body.overridePnl === undefined ||
    body.overridePnl === null ||
    body.overridePnl === ""
      ? null
      : Number(body.overridePnl);
  const note = String(body.note ?? "").trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(openedAt)) {
    return NextResponse.json(
      { error: "Data otwarcia jest wymagana w formacie RRRR-MM-DD." },
      { status: 400 }
    );
  }
  if (!(volume > 0) || !(openPrice > 0) || !(pointValue > 0)) {
    return NextResponse.json(
      { error: "Wolumen, cena otwarcia i wartość punktu muszą być liczbami dodatnimi." },
      { status: 400 }
    );
  }
  if (overridePrice !== null && !Number.isFinite(overridePrice)) {
    return NextResponse.json(
      { error: "Nieprawidłowa wartość nadpisania kursu." },
      { status: 400 }
    );
  }
  if (overridePnl !== null && !Number.isFinite(overridePnl)) {
    return NextResponse.json(
      { error: "Nieprawidłowa wartość nadpisania P&L." },
      { status: 400 }
    );
  }

  const created = db
    .insert(cfdPositions)
    .values({
      symbol: deriveSymbol(quoteSymbol),
      name,
      direction,
      volume,
      openPrice,
      pointValue,
      quoteSymbol,
      openedAt,
      overridePrice,
      overridePnl,
      quotePrice: null,
      quoteUpdatedAt: null,
      note,
      createdAt: nowISO(),
    })
    .returning()
    .get();

  // Od razu próbujemy dociągnąć bieżącą cenę — błąd nie blokuje utworzenia
  // pozycji (wzorzec: POST /api/companies robi refreshQuotes best-effort).
  let refreshError: string | null = null;
  let finalPosition = created;
  try {
    const chart = await fetchChart(created.quoteSymbol);
    if (chart.price !== null) {
      finalPosition = db
        .update(cfdPositions)
        .set({ quotePrice: chart.price, quoteUpdatedAt: nowISO() })
        .where(eq(cfdPositions.id, created.id))
        .returning()
        .get();
    }
  } catch (e) {
    refreshError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({ position: finalPosition, refreshError });
}
