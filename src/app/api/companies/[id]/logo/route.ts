import { NextRequest, NextResponse } from "next/server";
import { db, companyLogos } from "@/db";
import { eq } from "drizzle-orm";
import { logoPath } from "@/lib/logos";
import fs from "node:fs";

type Ctx = { params: Promise<{ id: string }> };

// Serwowanie bajtów logo spółki z lokalnego cache'u (DATA_DIR/logos/{id}) —
// kalka src/app/api/attachments/[id]/route.ts. GET route handlery nie są
// cache'owane domyślnie w tej wersji Next (zweryfikowane w
// node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md),
// więc nie trzeba `export const dynamic`. Cache-Control krótszy niż przy
// załącznikach i bez `immutable` — logo bywa odświeżane pod tym samym URL.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId) || companyId <= 0) {
    return NextResponse.json({ error: "Nie znaleziono logo." }, { status: 404 });
  }

  const record = db
    .select()
    .from(companyLogos)
    .where(eq(companyLogos.companyId, companyId))
    .get();
  if (!record || record.source === "NONE" || !record.mime) {
    return NextResponse.json({ error: "Nie znaleziono logo." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await fs.promises.readFile(logoPath(companyId));
  } catch {
    return NextResponse.json({ error: "Plik logo nie istnieje." }, { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mime,
      "Content-Length": String(record.size ?? buffer.length),
      "Cache-Control": "public, max-age=86400",
    },
  });
}
