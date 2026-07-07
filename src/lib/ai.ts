// Integracja AI przez OpenRouter (API zgodne z OpenAI chat completions).
// Klucz i model konfigurowane w Ustawieniach.

import {
  db,
  companies,
  newsItems,
  newsCompany,
  notes,
  quotesLatest,
} from "@/db";
import { desc, eq } from "drizzle-orm";
import { getSetting, SETTING_KEYS, DEFAULT_MODEL } from "./settings";
import { computePortfolio } from "./portfolio";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function getAiConfig(): { apiKey: string | null; model: string } {
  return {
    apiKey: getSetting(SETTING_KEYS.openrouterApiKey),
    model: getSetting(SETTING_KEYS.openrouterModel) || DEFAULT_MODEL,
  };
}

// Buduje kontekst o spółce: dane, notowanie, ostatnie newsy, notatki.
export function buildCompanyContext(companyId: number): string {
  const company = db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();
  if (!company) return "";

  const parts: string[] = [];
  parts.push(
    `## Spółka\n${company.name} (${company.ticker}), rynek: ${company.market}, waluta: ${company.currency}`
  );

  const quote = db
    .select()
    .from(quotesLatest)
    .where(eq(quotesLatest.companyId, companyId))
    .get();
  if (quote) {
    const chg =
      quote.prevClose && quote.prevClose > 0
        ? (((quote.price - quote.prevClose) / quote.prevClose) * 100).toFixed(2)
        : null;
    parts.push(
      `## Notowanie\nKurs: ${quote.price} ${company.currency} (${quote.date ?? "?"})${chg ? `, zmiana dzienna: ${chg}%` : ""}`
    );
  }

  const holding = computePortfolio().holdings.find(
    (h) => h.company.id === companyId
  );
  if (holding) {
    parts.push(
      `## Pozycja w portfelu\n${holding.shares} akcji, średni koszt ${holding.avgCost.toFixed(2)} ${company.currency}, wynik niezrealizowany: ${holding.unrealizedPct?.toFixed(1) ?? "?"}%`
    );
  }

  const news = db
    .select({
      title: newsItems.title,
      publishedAt: newsItems.publishedAt,
      summary: newsItems.summary,
    })
    .from(newsCompany)
    .innerJoin(newsItems, eq(newsCompany.newsId, newsItems.id))
    .where(eq(newsCompany.companyId, companyId))
    .orderBy(desc(newsItems.publishedAt))
    .limit(15)
    .all();
  if (news.length > 0) {
    parts.push(
      `## Ostatnie newsy\n` +
        news
          .map(
            (n) =>
              `- [${n.publishedAt?.slice(0, 10) ?? "?"}] ${n.title}${n.summary ? ` — ${n.summary.slice(0, 200)}` : ""}`
          )
          .join("\n")
    );
  }

  const companyNotes = db
    .select()
    .from(notes)
    .where(eq(notes.companyId, companyId))
    .orderBy(desc(notes.updatedAt))
    .limit(5)
    .all();
  if (companyNotes.length > 0) {
    parts.push(
      `## Notatki użytkownika\n` +
        companyNotes
          .map((n) => `### ${n.title}\n${n.content.slice(0, 3000)}`)
          .join("\n\n")
    );
  }

  return parts.join("\n\n");
}

export const SYSTEM_PROMPT = `Jesteś asystentem researchu inwestycyjnego w prywatnym dashboardzie użytkownika.
Pomagasz analizować spółki giełdowe (GPW i rynki zagraniczne): fundamenty, newsy, ryzyka, wyceny.
Odpowiadasz po polsku, konkretnie i rzeczowo. Gdy czegoś nie wiesz lub dane mogą być nieaktualne — mówisz to wprost.
Nie udzielasz porad inwestycyjnych w sensie prawnym; przedstawiasz analizę i argumenty, decyzja należy do użytkownika.
Formatuj odpowiedzi w markdown.`;

// Wywołanie OpenRouter — zwraca surowy Response (SSE przy stream: true).
export async function openrouterChat(
  messages: ChatMessage[],
  options: { stream?: boolean } = {}
): Promise<Response> {
  const { apiKey, model } = getAiConfig();
  if (!apiKey) {
    throw new Error(
      "Brak klucza OpenRouter. Dodaj klucz API w Ustawieniach."
    );
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Invest Dashboard",
    },
    body: JSON.stringify({
      model,
      messages,
      stream: options.stream ?? false,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.error?.message ?? detail;
    } catch {
      // ignorujemy — zostaje kod HTTP
    }
    throw new Error(`OpenRouter: ${detail}`);
  }
  return res;
}
