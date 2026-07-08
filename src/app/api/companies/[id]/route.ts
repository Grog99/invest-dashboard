import { NextRequest, NextResponse } from "next/server";
import { db, companies, quotesDaily, quotesLatest, INSTRUMENT_TYPES } from "@/db";
import { eq } from "drizzle-orm";
import { refreshQuotes } from "@/lib/quotes";
import { refreshLogos } from "@/lib/logos";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const companyId = Number(id);
  const body = await req.json();

  const existing = db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();
  if (!existing) {
    return NextResponse.json({ error: "Nie znaleziono spółki." }, { status: 404 });
  }

  const updates: Partial<typeof companies.$inferInsert> = {};
  if (typeof body.ticker === "string" && body.ticker.trim()) {
    updates.ticker = body.ticker.trim().toUpperCase();
  }
  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (["GPW", "US", "OTHER"].includes(body.market)) {
    updates.market = body.market;
  }
  if (typeof body.currency === "string" && body.currency.trim()) {
    updates.currency = body.currency.trim().toUpperCase();
  }
  if (typeof body.quoteSymbol === "string" && body.quoteSymbol.trim()) {
    updates.quoteSymbol = body.quoteSymbol.trim().toUpperCase();
  }
  if (body.watchlist !== undefined) {
    updates.watchlist = body.watchlist ? 1 : 0;
  }
  if (body.aliases !== undefined) {
    updates.aliases = String(body.aliases).trim() || null;
  }
  if (INSTRUMENT_TYPES.includes(body.type)) {
    updates.type = body.type;
  }
  if (body.domain !== undefined) {
    updates.domain = String(body.domain ?? "").trim().toLowerCase() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Brak zmian do zapisania." }, { status: 400 });
  }

  const updated = db
    .update(companies)
    .set(updates)
    .where(eq(companies.id, companyId))
    .returning()
    .get();
  if (!updated) {
    return NextResponse.json({ error: "Nie znaleziono spółki." }, { status: 404 });
  }

  // Zmiana (znormalizowanego) symbolu notowań: stary cache świec miesza skale
  // z nowym instrumentem, a inkrementalny refresh nie dociągnie pełnej
  // historii (dobiera dane tylko od ostatniej świecy) — kasujemy cache i
  // robimy pełny re-fetch, tak jak przy tworzeniu nowej spółki.
  let refreshError: string | null = null;
  if (updated.quoteSymbol !== existing.quoteSymbol) {
    db.delete(quotesDaily).where(eq(quotesDaily.companyId, companyId)).run();
    db.delete(quotesLatest).where(eq(quotesLatest.companyId, companyId)).run();
    try {
      const result = await refreshQuotes([companyId]);
      if (result.errors.length > 0) {
        refreshError = result.errors.map((e) => e.message).join("; ");
      }
    } catch (e) {
      refreshError = e instanceof Error ? e.message : String(e);
    }
  }

  // Logo — best-effort, nieblokujące (wzorzec refreshQuotes powyżej).
  // Odpalane przy każdym PATCH (nie tylko zmiana symbolu), bo zmiana
  // `domain`/`name` też wpływa na resolveLogo().
  try {
    await refreshLogos([companyId]);
  } catch {
    // ignorujemy — logo można dociągnąć później przy "Odśwież ceny"
  }

  return NextResponse.json({ company: updated, refreshError });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  db.delete(companies).where(eq(companies.id, Number(id))).run();
  return NextResponse.json({ ok: true });
}
