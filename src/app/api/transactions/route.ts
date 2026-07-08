import { NextRequest, NextResponse } from "next/server";
import { db, companies, transactions } from "@/db";
import { eq } from "drizzle-orm";
import { ensureFxRates } from "@/lib/nbp";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const companyId = Number(body.companyId);
  const type = body.type === "SELL" ? "SELL" : "BUY";
  const date = String(body.date ?? "").trim();
  const quantity = Number(body.quantity);
  const price = Number(body.price);
  const commission = Number(body.commission ?? 0) || 0;

  if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Wymagana spółka i data w formacie RRRR-MM-DD." },
      { status: 400 }
    );
  }
  if (!(quantity > 0) || !(price >= 0)) {
    return NextResponse.json(
      { error: "Ilość musi być dodatnia, a cena nieujemna." },
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
  if (company.type === "INDEX") {
    return NextResponse.json(
      {
        error:
          "Nie można dodać transakcji dla indeksu — indeks jest tylko obserwowany (wykres + watchlista), bez pozycji.",
      },
      { status: 400 }
    );
  }

  // Kurs D-1 potrzebny do przeliczeń PLN — dociągamy od razu.
  try {
    await ensureFxRates(company.currency, date);
  } catch {
    // brak internetu / NBP — przeliczenia uzupełnią się przy odświeżeniu notowań
  }

  const created = db
    .insert(transactions)
    .values({
      companyId,
      type,
      date,
      quantity,
      price,
      commission,
      note: String(body.note ?? "").trim() || null,
    })
    .returning()
    .get();

  return NextResponse.json({ transaction: created });
}
