import { NextResponse } from "next/server";
import { refreshNews, seedDefaultSourcesIfEmpty } from "@/lib/news";

export async function POST() {
  seedDefaultSourcesIfEmpty();
  const result = await refreshNews();
  return NextResponse.json(result);
}
