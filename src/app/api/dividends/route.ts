import { NextRequest, NextResponse } from "next/server";
import { db, companies, dividends } from "@/db";
import { eq } from "drizzle-orm";
import { ensureFxRates } from "@/lib/nbp";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const companyId = Number(body.companyId);
  const date = String(body.date ?? "").trim();
  const amount = Number(body.amount);
  const taxWithheld = Number(body.taxWithheld ?? 0) || 0;

  if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(amount > 0)) {
    return NextResponse.json(
      { error: "Wymagana spółka, data (RRRR-MM-DD) i dodatnia kwota." },
      { status: 400 }
    );
  }

  const company = db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();
  if (!company) {
    return NextResponse.json({ error: "Nie znaleziono spółki." }, { status: 404 });
  }

  try {
    await ensureFxRates(company.currency, date);
  } catch {
    // przeliczenia uzupełnią się przy odświeżeniu notowań
  }

  const created = db
    .insert(dividends)
    .values({
      companyId,
      date,
      amount,
      taxWithheld,
      note: String(body.note ?? "").trim() || null,
    })
    .returning()
    .get();

  return NextResponse.json({ dividend: created });
}
