import { NextRequest, NextResponse } from "next/server";
import { db, noteTemplates } from "@/db";
import { asc } from "drizzle-orm";
import { nowISO } from "@/lib/format";

export async function GET() {
  const templates = db
    .select()
    .from(noteTemplates)
    .orderBy(asc(noteTemplates.name))
    .all();
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = String(body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Nazwa jest wymagana." }, { status: 400 });
  }
  const created = db
    .insert(noteTemplates)
    .values({
      name,
      content: String(body.content ?? ""),
      createdAt: nowISO(),
      updatedAt: nowISO(),
    })
    .returning()
    .get();
  return NextResponse.json({ template: created });
}
