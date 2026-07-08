// Logo spółek: cache bajtów na dysku (kalka src/lib/attachments.ts) + status
// w tabeli company_logos, resolver z łańcuchem źródeł (Brandfetch → Wikidata
// → Google favicon) i orkiestracja refreshLogos() (kalka refreshQuotes() z
// src/lib/quotes.ts). Patrz docs/plans/ikonki-spolek.md.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { and, inArray, ne } from "drizzle-orm";
import { db, companies, companyLogos, DATA_DIR, type Company } from "@/db";
import { sniffImageMime } from "./attachments";
import { nowISO } from "./format";

export const LOGOS_DIR = path.join(DATA_DIR, "logos");

// Klucz pliku na dysku = całkowite id spółki — jedyne wejście do budowy
// ścieżki, więc path traversal jest niemożliwy u źródła (kalka attachmentPath).
export function logoPath(companyId: number): string {
  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error(`Nieprawidłowe id spółki: ${companyId}`);
  }
  return path.join(LOGOS_DIR, String(companyId));
}

export function ensureLogosDir(): void {
  fs.mkdirSync(LOGOS_DIR, { recursive: true });
}

// Seed domen znanych spółek — używany jako default gdy company.domain jest
// puste. Nieblokujący: spółki spoza mapy dostają logo przez pole `domain`
// (edytowalne w CompanyForm) albo przez Wikidata po nazwie.
export const TICKER_DOMAINS: Record<string, string> = {
  // GPW — WIG20
  PKN: "orlen.pl",
  CDR: "cdprojekt.com",
  PZU: "pzu.pl",
  PKO: "pkobp.pl",
  PEO: "pekao.com.pl",
  KGH: "kghm.com",
  DNP: "dinopolska.pl",
  LPP: "lppsa.com",
  ALE: "allegro.pl",
  CCC: "ccc.eu",
  JSW: "jsw.pl",
  PGE: "gkpge.pl",
  PGN: "pgnig.pl",
  SPL: "santander.pl",
  OPL: "orange.pl",
  // US
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  GOOGL: "abc.xyz",
  AMZN: "amazon.com",
  TSLA: "tesla.com",
  NVDA: "nvidia.com",
  META: "meta.com",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 8000;
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const LOGO_SIZE = 128;
// Logo zmienia się rzadko — retry dla "NONE"/odświeżenie trafień co 30 dni,
// żeby nie bić w zewnętrzne API przy każdym "Odśwież ceny".
const LOGO_TTL_DAYS = 30;

interface FetchedImage {
  buf: Buffer;
  mime: string;
}

export interface ResolvedLogo {
  buf: Buffer;
  mime: string;
  source: "BRANDFETCH" | "WIKIDATA" | "GOOGLE";
}

// Pobiera bajty spod URL i waliduje, że to naprawdę obraz: Content-Type
// (szybkie odrzucenie stron błędów HTML) + sniff magic bytes (reużyty
// sniffImageMime z attachments.ts — autorytatywna walidacja, nie ufamy
// nagłówkowi, dokładnie jak przy załącznikach). SVG nie jest wspierany przez
// sniffImageMime (żadnych magic bytes PNG/JPEG/GIF/WEBP) — świadomie: Commons
// czasem zwraca logo jako SVG, ale reużywamy sniffImageMime bez modyfikacji
// (patrz plan, ryzyko „Sniffing/rozmiar"), więc taki wynik jest odrzucany i
// łańcuch próbuje kolejne źródło.
async function fetchImageBytes(url: string): Promise<FetchedImage | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "image/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType && !contentType.startsWith("image/")) return null;

  const arrayBuf = await res.arrayBuffer();
  if (arrayBuf.byteLength === 0 || arrayBuf.byteLength > MAX_SOURCE_BYTES) {
    return null;
  }
  const buf = Buffer.from(arrayBuf);
  const mime = sniffImageMime(buf);
  if (!mime) return null;
  return { buf, mime };
}

// Normalizacja do stałego 128×128 PNG, kwadrat na przezroczystym tle (logo
// bywa niekwadratowe) — wzorzec processImage() z attachments.ts (sharp,
// failOn: "none"), ale zawsze re-encode do stałego rozmiaru zamiast
// warunkowego resize "jeśli za duże".
async function normalizeLogo(buf: Buffer): Promise<Buffer> {
  return sharp(buf, { failOn: "none" })
    .resize(LOGO_SIZE, LOGO_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

// 1. Brandfetch (PRIMARY, tylko gdy BRANDFETCH_CLIENT_ID ustawiony — Logo
// Link wymaga darmowego client id, patrz docs/plans/ikonki-spolek.md).
// Opcjonalny env var: bez niego krok jest pomijany i łańcuch startuje od
// Wikidata (decyzja z rundy doprecyzowania planu).
async function tryBrandfetch(
  domain: string | null
): Promise<(FetchedImage & { source: "BRANDFETCH" }) | null> {
  const clientId = process.env.BRANDFETCH_CLIENT_ID;
  if (!domain || !clientId) return null;
  const img = await fetchImageBytes(
    `https://cdn.brandfetch.io/${encodeURIComponent(domain)}?c=${encodeURIComponent(clientId)}`
  );
  return img ? { ...img, source: "BRANDFETCH" } : null;
}

// 2. Wikidata/Wikipedia (SECONDARY) — najlepsze pokrycie polskich blue-chipów,
// działa bez domeny. Wyszukanie encji po nazwie (wbsearchentities), potem w
// jednym zapytaniu wbgetentities: P154 (logo na Commons) + sitelink plwiki
// jako fallback na miniaturkę z Wikipedia REST summary.
async function tryWikidata(
  name: string
): Promise<(FetchedImage & { source: "WIKIDATA" }) | null> {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      name
    )}&language=pl&format=json&limit=1&type=item`;
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const id: string | undefined = searchData?.search?.[0]?.id;
    if (!id) return null;

    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(
      id
    )}&props=claims|sitelinks&sitefilter=plwiki&format=json`;
    const entityRes = await fetch(entityUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!entityRes.ok) return null;
    const entityData = await entityRes.json();
    const entity = entityData?.entities?.[id];

    const filename: string | undefined =
      entity?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
    if (filename) {
      const fileUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
        filename
      )}?width=256`;
      const img = await fetchImageBytes(fileUrl);
      if (img) return { ...img, source: "WIKIDATA" };
    }

    const plTitle: string | undefined = entity?.sitelinks?.plwiki?.title;
    if (plTitle) {
      const summaryUrl = `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        plTitle
      )}`;
      const summaryRes = await fetch(summaryUrl, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        const thumb: string | undefined = summaryData?.thumbnail?.source;
        if (thumb) {
          const img = await fetchImageBytes(thumb);
          if (img) return { ...img, source: "WIKIDATA" };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// 3. Google favicon (TERTIARY) — nieoficjalne, wymaga domeny, prawie zawsze
// coś zwraca dla żywej domeny (czasem generyczny glob — akceptowalne jako
// ostatni krok przed awatarem).
async function tryGoogleFavicon(
  domain: string | null
): Promise<(FetchedImage & { source: "GOOGLE" }) | null> {
  if (!domain) return null;
  const img = await fetchImageBytes(
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
  );
  return img ? { ...img, source: "GOOGLE" } : null;
}

// Łańcuch Brandfetch → Wikidata → Google favicon, pierwszy sukces wygrywa.
// Indeksy (type === "INDEX") nie mają sensownego logo — zawsze awatar (patrz
// non-goals w planie), więc resolver od razu zwraca null bez sieciowych prób.
export async function resolveLogo(company: Company): Promise<ResolvedLogo | null> {
  if (company.type === "INDEX") return null;

  const domain = company.domain ?? TICKER_DOMAINS[company.ticker.toUpperCase()] ?? null;

  const found =
    (await tryBrandfetch(domain)) ??
    (await tryWikidata(company.name)) ??
    (await tryGoogleFavicon(domain));
  if (!found) return null;

  const buf = await normalizeLogo(found.buf);
  return { buf, mime: "image/png", source: found.source };
}

function isStale(checkedAt: string): boolean {
  const checked = Date.parse(checkedAt);
  if (Number.isNaN(checked)) return true;
  return Date.now() - checked > LOGO_TTL_DAYS * 24 * 60 * 60 * 1000;
}

export interface LogoRefreshResult {
  updated: number;
  errors: { company: string; message: string }[];
}

// Orkiestracja — kalka refreshQuotes() z src/lib/quotes.ts: iteracja po
// spółkach (opcjonalnie zawężona do companyIds), zbieranie błędów w wyniku,
// respektowanie TTL przez checkedAt. Świadomie osobna funkcja/TTL od
// refreshQuotes (inna logika), ale wołana z tego samego route'a odświeżania
// cen (src/app/api/quotes/refresh/route.ts) — bez osobnego przycisku (decyzja
// z rundy doprecyzowania planu).
export async function refreshLogos(companyIds?: number[]): Promise<LogoRefreshResult> {
  let list = db.select().from(companies).all();
  if (companyIds && companyIds.length > 0) {
    const idSet = new Set(companyIds);
    list = list.filter((c) => idSet.has(c.id));
  }

  const result: LogoRefreshResult = { updated: 0, errors: [] };
  if (list.length === 0) return result;

  ensureLogosDir();
  const existing = new Map(
    db.select().from(companyLogos).all().map((r) => [r.companyId, r])
  );

  for (const company of list) {
    const prev = existing.get(company.id);
    if (prev && !isStale(prev.checkedAt)) continue;

    try {
      const resolved = await resolveLogo(company);
      const now = nowISO();
      if (resolved) {
        await fs.promises.writeFile(logoPath(company.id), resolved.buf);
        db.insert(companyLogos)
          .values({
            companyId: company.id,
            source: resolved.source,
            mime: resolved.mime,
            size: resolved.buf.length,
            fetchedAt: now,
            checkedAt: now,
          })
          .onConflictDoUpdate({
            target: companyLogos.companyId,
            set: {
              source: resolved.source,
              mime: resolved.mime,
              size: resolved.buf.length,
              fetchedAt: now,
              checkedAt: now,
            },
          })
          .run();
        result.updated++;
      } else {
        // Negatywny wynik — zapamiętujemy, żeby nie ponawiać przed TTL.
        db.insert(companyLogos)
          .values({
            companyId: company.id,
            source: "NONE",
            mime: null,
            size: null,
            fetchedAt: null,
            checkedAt: now,
          })
          .onConflictDoUpdate({
            target: companyLogos.companyId,
            set: { source: "NONE", mime: null, size: null, checkedAt: now },
          })
          .run();
      }
    } catch (e) {
      result.errors.push({
        company: company.ticker,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

// Helper serwerowy dla stron: jedno zapytanie do company_logos po
// source != 'NONE', wołany raz na stronę (wzorzec mapy `quotes` w
// watchlist/page.tsx). Strony przekazują wynik jako `hasLogo` do
// CompanyLogo, więc spółki bez logo renderują awatar od razu, bez 404.
export function getLogoFlags(companyIds: number[]): Map<number, boolean> {
  if (companyIds.length === 0) return new Map();
  const rows = db
    .select({ companyId: companyLogos.companyId })
    .from(companyLogos)
    .where(
      and(inArray(companyLogos.companyId, companyIds), ne(companyLogos.source, "NONE"))
    )
    .all();
  return new Map(rows.map((r) => [r.companyId, true]));
}
