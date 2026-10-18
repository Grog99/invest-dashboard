import { db, companies, transactions } from "@/db";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const HEADER = [
  "ticker",
  "type",
  "date",
  "quantity",
  "price",
  "commission",
  "currency",
  "note",
] as const;

// RFC 4180: pole z przecinkiem, cudzysłowem lub nową linią w cudzysłowach,
// wewnętrzne cudzysłowy podwajamy.
function csvField(value: string | number | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Eksport wszystkich transakcji do CSV (backup / analiza w Excelu) — punkt 1.7
// roadmapy. Kolejność chronologiczna, żeby plik dało się czytać jak historię.
export async function GET() {
  const rows = db
    .select({
      ticker: companies.ticker,
      type: transactions.type,
      date: transactions.date,
      quantity: transactions.quantity,
      price: transactions.price,
      commission: transactions.commission,
      currency: companies.currency,
      note: transactions.note,
    })
    .from(transactions)
    .innerJoin(companies, eq(transactions.companyId, companies.id))
    .orderBy(asc(transactions.date), asc(transactions.id))
    .all();

  const lines = [
    HEADER.join(","),
    ...rows.map((r) => HEADER.map((k) => csvField(r[k])).join(",")),
  ];
  // BOM, żeby Excel poprawnie rozpoznał UTF-8 (polskie znaki w notatkach).
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const today = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transakcje-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
