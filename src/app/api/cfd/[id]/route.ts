import { NextRequest, NextResponse } from "next/server";
import { db, cfdPositions } from "@/db";
import { eq } from "drizzle-orm";

type Ctx = { params: Promise<{ id: string }> };

// Kalka symbolu z quoteSymbol — patrz komentarz w src/app/api/cfd/route.ts.
function deriveSymbol(quoteSymbol: string): string {
  const cleaned = quoteSymbol.replace(/^\^/, "").replace(/\.[A-Za-z]{1,3}$/, "");
  return cleaned || quoteSymbol;
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json();

  // Walidacja jak w POST (src/app/api/cfd/route.ts): niepoprawne wartości
  // ODRZUCAMY (400), nie pomijamy po cichu — inaczej klient dostaje 200 z
  // niezmienionym polem i myśli, że zapisał.
  const updates: Partial<typeof cfdPositions.$inferInsert> = {};
  if (body.direction !== undefined) {
    if (body.direction !== "LONG" && body.direction !== "SHORT") {
      return NextResponse.json(
        { error: "Kierunek musi być LONG albo SHORT." },
        { status: 400 }
      );
    }
    updates.direction = body.direction;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name) updates.name = name;
  }
  if (body.volume !== undefined) {
    const volume = Number(body.volume);
    if (!(volume > 0)) {
      return NextResponse.json(
        { error: "Wolumen musi być liczbą dodatnią." },
        { status: 400 }
      );
    }
    updates.volume = volume;
  }
  if (body.openPrice !== undefined) {
    const openPrice = Number(body.openPrice);
    if (!(openPrice > 0)) {
      return NextResponse.json(
        { error: "Cena otwarcia musi być liczbą dodatnią." },
        { status: 400 }
      );
    }
    updates.openPrice = openPrice;
  }
  if (body.pointValue !== undefined) {
    const pointValue = Number(body.pointValue);
    if (!(pointValue > 0)) {
      return NextResponse.json(
        { error: "Wartość punktu musi być liczbą dodatnią." },
        { status: 400 }
      );
    }
    updates.pointValue = pointValue;
  }
  if (body.quoteSymbol !== undefined) {
    const quoteSymbol = String(body.quoteSymbol).trim().toUpperCase();
    if (quoteSymbol) {
      updates.quoteSymbol = quoteSymbol;
      updates.symbol = deriveSymbol(quoteSymbol);
    }
  }
  if (body.openedAt !== undefined) {
    if (
      typeof body.openedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.openedAt)
    ) {
      return NextResponse.json(
        { error: "Data otwarcia musi być w formacie RRRR-MM-DD." },
        { status: 400 }
      );
    }
    updates.openedAt = body.openedAt;
  }
  // Override — undefined = nie dotykaj, null/"" = wyczyść, liczba = ustaw.
  if (body.overridePrice !== undefined) {
    if (body.overridePrice === null || body.overridePrice === "") {
      updates.overridePrice = null;
    } else {
      const overridePrice = Number(body.overridePrice);
      if (!Number.isFinite(overridePrice)) {
        return NextResponse.json(
          { error: "Nieprawidłowa wartość nadpisania kursu." },
          { status: 400 }
        );
      }
      updates.overridePrice = overridePrice;
    }
  }
  if (body.overridePnl !== undefined) {
    if (body.overridePnl === null || body.overridePnl === "") {
      updates.overridePnl = null;
    } else {
      const overridePnl = Number(body.overridePnl);
      if (!Number.isFinite(overridePnl)) {
        return NextResponse.json(
          { error: "Nieprawidłowa wartość nadpisania P&L." },
          { status: 400 }
        );
      }
      updates.overridePnl = overridePnl;
    }
  }
  if (body.swapPln !== undefined) {
    if (body.swapPln === null || body.swapPln === "") {
      updates.swapPln = null;
    } else {
      const swapPln = Number(body.swapPln);
      if (!Number.isFinite(swapPln)) {
        return NextResponse.json(
          { error: "Nieprawidłowa wartość swapu." },
          { status: 400 }
        );
      }
      updates.swapPln = swapPln;
    }
  }
  if (body.note !== undefined) {
    updates.note = String(body.note).trim() || null;
  }

  // Pusty set() wygenerowałby "UPDATE ... SET WHERE" → błąd składni SQLite (500).
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "Brak pól do aktualizacji." },
      { status: 400 }
    );
  }

  const updated = db
    .update(cfdPositions)
    .set(updates)
    .where(eq(cfdPositions.id, Number(id)))
    .returning()
    .get();
  if (!updated) {
    return NextResponse.json({ error: "Nie znaleziono pozycji CFD." }, { status: 404 });
  }
  return NextResponse.json({ position: updated });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  db.delete(cfdPositions).where(eq(cfdPositions.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
