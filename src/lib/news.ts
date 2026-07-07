// Moduł newsów: pobieranie kanałów RSS/Atom, deduplikacja po URL
// i dopasowywanie wpisów do spółek (ticker / nazwa / aliasy).

import { XMLParser } from "fast-xml-parser";
import {
  db,
  companies,
  newsSources,
  newsItems,
  newsCompany,
  type Company,
  type NewsSource,
} from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { computeDedupKey, nowISO } from "./format";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export interface FeedItem {
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null; // ISO
}

function stripHtml(html: string): string {
  let text = html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!\[CDATA\[|\]\]>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  // Bankier w opisach ESPI zostawia surowy (często ucięty) CSS bez tagów —
  // od pierwszej klamry wszystko jest śmieciem, ucinamy razem z selektorem.
  const brace = text.indexOf("{");
  if (brace !== -1) {
    let cut = brace;
    while (cut > 0 && /[a-z0-9.#>\s,:*-]/i.test(text[cut - 1])) cut--;
    text = text.slice(0, cut).trim();
  }
  // Boilerplate raportów ESPI ("Spis treści… PODPISY OSÓB…") nie wnosi nic.
  text = text
    .replace(/Spis treści:[\s\S]*?PODPISY OSÓB REPREZENTUJĄCYCH SPÓŁKĘ\s*/, "")
    .replace(/^Spis załączników:[\s\S]*$/, "")
    .trim();

  return text;
}

function toIso(dateStr: unknown): string | null {
  if (typeof dateStr !== "string" || !dateStr.trim()) return null;
  const d = new Date(dateStr.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function textOf(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // fast-xml-parser: { "#text": "...", "@_attr": ... } lub CDATA
    if (typeof o["#text"] === "string") return o["#text"];
    if (typeof o["__cdata"] === "string") return o["__cdata"];
  }
  return "";
}

export function parseFeed(xml: string): FeedItem[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    cdataPropName: "__cdata",
  });
  const doc = parser.parse(xml);
  const items: FeedItem[] = [];

  // RSS 2.0
  const rssItems = doc?.rss?.channel?.item;
  if (rssItems) {
    const arr = Array.isArray(rssItems) ? rssItems : [rssItems];
    for (const it of arr) {
      const title = stripHtml(textOf(it.title));
      const url = textOf(it.link).trim() || textOf(it.guid).trim();
      if (!title || !url) continue;
      items.push({
        title,
        url,
        summary: stripHtml(textOf(it.description)).slice(0, 500) || null,
        publishedAt: toIso(textOf(it.pubDate)) ?? toIso(textOf(it["dc:date"])),
      });
    }
    return items;
  }

  // Atom
  const atomEntries = doc?.feed?.entry;
  if (atomEntries) {
    const arr = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
    for (const it of arr) {
      const title = stripHtml(textOf(it.title));
      let url = "";
      const links = Array.isArray(it.link) ? it.link : [it.link];
      for (const l of links) {
        if (!l) continue;
        const href = typeof l === "object" ? textOf(l["@_href"]) : textOf(l);
        if (href) {
          url = href;
          if (typeof l === "object" && l["@_rel"] === "alternate") break;
        }
      }
      if (!title || !url) continue;
      items.push({
        title,
        url,
        summary:
          stripHtml(textOf(it.summary) || textOf(it.content)).slice(0, 500) ||
          null,
        publishedAt: toIso(textOf(it.published)) ?? toIso(textOf(it.updated)),
      });
    }
  }
  return items;
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const items = parseFeed(xml);
  if (items.length === 0 && !/<(rss|feed)[\s>]/i.test(xml)) {
    throw new Error("Odpowiedź nie wygląda na kanał RSS/Atom");
  }
  return items;
}

interface Matcher {
  companyId: number;
  patterns: RegExp[];
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatchers(list: Company[]): Matcher[] {
  return list.map((c) => {
    const patterns: RegExp[] = [];
    const ticker = c.ticker.trim();
    // Ticker jako osobne słowo (min. 3 znaki, żeby uniknąć fałszywych trafień).
    if (ticker.length >= 3) {
      patterns.push(new RegExp(`(?<![\\p{L}\\d])${escapeRegex(ticker)}(?![\\p{L}\\d])`, "iu"));
    }
    const name = c.name.trim();
    if (name.length >= 3) {
      patterns.push(new RegExp(escapeRegex(name), "iu"));
    }
    for (const alias of (c.aliases ?? "").split(",")) {
      const a = alias.trim();
      if (a.length >= 3) patterns.push(new RegExp(escapeRegex(a), "iu"));
    }
    return { companyId: c.id, patterns };
  });
}

function matchCompanies(text: string, matchers: Matcher[]): number[] {
  const ids: number[] = [];
  for (const m of matchers) {
    if (m.patterns.some((p) => p.test(text))) ids.push(m.companyId);
  }
  return ids;
}

export interface NewsRefreshResult {
  fetched: number;
  inserted: number;
  errors: { source: string; message: string }[];
}

export async function refreshNews(): Promise<NewsRefreshResult> {
  const sources = db
    .select()
    .from(newsSources)
    .where(eq(newsSources.enabled, 1))
    .all();
  const allCompanies = db.select().from(companies).all();
  const matchers = buildMatchers(allCompanies);

  const result: NewsRefreshResult = { fetched: 0, inserted: 0, errors: [] };

  for (const source of sources) {
    try {
      const items = await fetchFeed(source.url);
      result.fetched += items.length;

      for (const item of items) {
        const dedupKey = computeDedupKey(item.title, item.publishedAt);
        const inserted = db
          .insert(newsItems)
          .values({
            sourceId: source.id,
            title: item.title,
            url: item.url,
            summary: item.summary,
            publishedAt: item.publishedAt,
            createdAt: nowISO(),
            dedupKey,
          })
          .onConflictDoNothing()
          .returning({ id: newsItems.id })
          .get();

        let newsId: number;
        if (inserted) {
          newsId = inserted.id;
          result.inserted++;
        } else {
          // Konflikt na url lub dedup_key — nie pomijamy matchingu, tylko
          // doklejamy ewentualne brakujące dopasowania do kanonicznego wiersza.
          const existing = db
            .select({ id: newsItems.id })
            .from(newsItems)
            .where(
              dedupKey
                ? eq(newsItems.dedupKey, dedupKey)
                : eq(newsItems.url, item.url)
            )
            .get();
          if (!existing) continue; // rzadki edge (np. ten sam url, zmieniony tytuł) — pomijamy
          newsId = existing.id;
        }

        // Dopasowanie do spółek.
        const companyIds = new Set<number>();
        if (source.companyId !== null) {
          companyIds.add(source.companyId);
        }
        const text = `${item.title} ${item.summary ?? ""}`;
        for (const id of matchCompanies(text, matchers)) companyIds.add(id);

        for (const companyId of companyIds) {
          db.insert(newsCompany)
            .values({ newsId, companyId })
            .onConflictDoNothing()
            .run();
        }
      }

      db.update(newsSources)
        .set({ lastFetchedAt: nowISO(), lastError: null })
        .where(eq(newsSources.id, source.id))
        .run();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      result.errors.push({ source: source.name, message });
      db.update(newsSources)
        .set({ lastFetchedAt: nowISO(), lastError: message })
        .where(eq(newsSources.id, source.id))
        .run();
    }
  }

  return result;
}

export interface NewsListItem {
  id: number;
  title: string;
  url: string;
  summary: string | null;
  publishedAt: string | null;
  read: boolean;
  sourceName: string | null;
  companies: { id: number; ticker: string }[];
}

// Kursor keyset — ostatni element zwróconej porcji. Para
// (coalesce(publishedAt,''), id) jest ścisłym porządkiem totalnym zgodnym
// z ORDER BY/sortem JS poniżej, więc daje stabilną paginację bez
// duplikatów/pominięć przy równoległych insertach (patrz plan
// docs/plans/paginacja-newsow.md).
export interface NewsCursor {
  publishedAt: string | null;
  id: number;
}

// Nieprzezroczysty param na drut: base64url(JSON { p, i }).
export function encodeCursor(item: {
  publishedAt: string | null;
  id: number;
}): string {
  return Buffer.from(
    JSON.stringify({ p: item.publishedAt, i: item.id }),
    "utf-8"
  ).toString("base64url");
}

export function decodeCursor(raw: string): NewsCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf-8")
    ) as { p: unknown; i: unknown };
    if (
      typeof parsed.i !== "number" ||
      (parsed.p !== null && typeof parsed.p !== "string")
    ) {
      return null;
    }
    return { publishedAt: parsed.p as string | null, id: parsed.i };
  } catch {
    return null;
  }
}

// Lista newsów z dopasowanymi spółkami i nazwą źródła (do stron).
export function listNews(opts: {
  companyId?: number;
  limit?: number;
  unreadOnly?: boolean;
  cursor?: NewsCursor;
}): NewsListItem[] {
  const limit = opts.limit ?? 50;

  // Warunek „starsze niż kursor" na (coalesce(published_at,''), id) malejąco —
  // coalesce eliminuje NULL z porównania (surowe published_at < ... wyklucza
  // wiersze bez daty z WHERE i nigdy by ich nie dostronicowało).
  const cursorCondition = opts.cursor
    ? sql`(coalesce(${newsItems.publishedAt}, ''), ${newsItems.id}) < (${opts.cursor.publishedAt ?? ""}, ${opts.cursor.id})`
    : undefined;
  const orderByExpr = sql`coalesce(${newsItems.publishedAt}, '') DESC, ${newsItems.id} DESC`;

  let baseIds: number[];
  if (opts.companyId) {
    baseIds = db
      .select({ id: newsItems.id })
      .from(newsItems)
      .innerJoin(newsCompany, eq(newsCompany.newsId, newsItems.id))
      .where(
        and(
          eq(newsCompany.companyId, opts.companyId),
          opts.unreadOnly ? eq(newsItems.read, 0) : undefined,
          cursorCondition
        )
      )
      .orderBy(orderByExpr)
      .limit(limit)
      .all()
      .map((r) => r.id);
  } else {
    baseIds = db
      .select({ id: newsItems.id })
      .from(newsItems)
      .where(
        and(
          opts.unreadOnly ? eq(newsItems.read, 0) : undefined,
          cursorCondition
        )
      )
      .orderBy(orderByExpr)
      .limit(limit)
      .all()
      .map((r) => r.id);
  }
  if (baseIds.length === 0) return [];

  const items = db
    .select()
    .from(newsItems)
    .where(inArray(newsItems.id, baseIds))
    .all();

  const matches = db
    .select({
      newsId: newsCompany.newsId,
      companyId: companies.id,
      ticker: companies.ticker,
    })
    .from(newsCompany)
    .innerJoin(companies, eq(companies.id, newsCompany.companyId))
    .where(inArray(newsCompany.newsId, baseIds))
    .all();
  const matchesByNews = new Map<number, { id: number; ticker: string }[]>();
  for (const m of matches) {
    const arr = matchesByNews.get(m.newsId) ?? [];
    arr.push({ id: m.companyId, ticker: m.ticker });
    matchesByNews.set(m.newsId, arr);
  }

  const sources = new Map(
    db.select().from(newsSources).all().map((s) => [s.id, s.name])
  );

  return items
    .map((it) => ({
      id: it.id,
      title: it.title,
      url: it.url,
      summary: it.summary,
      publishedAt: it.publishedAt,
      read: it.read === 1,
      sourceName: it.sourceId !== null ? (sources.get(it.sourceId) ?? null) : null,
      companies: matchesByNews.get(it.id) ?? [],
    }))
    .sort(
      (a, b) =>
        (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") ||
        b.id - a.id
    );
}

// Domyślne źródła — zweryfikowane kanały RSS, seedowane gdy tabela jest pusta.
export const DEFAULT_SOURCES: { name: string; url: string }[] = [
  {
    name: "Bankier — komunikaty ESPI",
    url: "https://www.bankier.pl/rss/espi.xml",
  },
  { name: "Bankier — Giełda", url: "https://www.bankier.pl/rss/gielda.xml" },
  {
    name: "Bankier — Wiadomości",
    url: "https://www.bankier.pl/rss/wiadomosci.xml",
  },
  {
    name: "Strefa Inwestorów",
    url: "https://strefainwestorow.pl/rss.xml",
  },
];

export function seedDefaultSourcesIfEmpty(): NewsSource[] {
  const existing = db.select().from(newsSources).all();
  if (existing.length > 0) return existing;
  for (const s of DEFAULT_SOURCES) {
    db.insert(newsSources).values({ name: s.name, url: s.url }).run();
  }
  return db.select().from(newsSources).all();
}
