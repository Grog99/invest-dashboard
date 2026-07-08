import { NextRequest, NextResponse } from "next/server";
import { refreshQuotes } from "@/lib/quotes";
import { refreshLogos } from "@/lib/logos";

export async function POST(req: NextRequest) {
  let companyIds: number[] | undefined;
  try {
    const body = await req.json();
    if (Array.isArray(body?.companyIds)) {
      companyIds = body.companyIds.map(Number).filter(Number.isFinite);
    }
  } catch {
    // puste body = odśwież wszystko
  }
  const result = await refreshQuotes(companyIds);

  // Logo odświeżane best-effort razem z cenami — decyzja z rundy
  // doprecyzowania planu (brak osobnego przycisku/route'a POST
  // /api/logos/refresh). Błąd pobrania logo nie może popsuć odpowiedzi ani
  // wyniku odświeżenia cen, więc jest całkowicie połknięty.
  try {
    await refreshLogos(companyIds);
  } catch {
    // ignorujemy — logo jest tylko kosmetyczne, ceny nie mogą na tym ucierpieć
  }

  return NextResponse.json(result);
}
