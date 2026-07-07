import { NextRequest, NextResponse } from "next/server";
import { refreshQuotes } from "@/lib/quotes";

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
  return NextResponse.json(result);
}
