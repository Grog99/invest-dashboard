import { NextRequest, NextResponse } from "next/server";
import { db, notes } from "@/db";
import { nowISO } from "@/lib/format";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Tytuł jest wymagany." }, { status: 400 });
  }
  const created = db
    .insert(notes)
    .values({
      title,
      content: String(body.content ?? ""),
      companyId: body.companyId ? Number(body.companyId) : null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    })
    .returning()
    .get();
  return NextResponse.json({ note: created });
}
