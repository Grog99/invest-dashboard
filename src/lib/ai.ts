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
  const typeLabels: Record<string, string> = {
    STOCK: "Akcje",
    ETF: "ETF",
    INDEX: "Indeks (tylko obserwacja, bez pozycji)",
  };
  parts.push(
    `## Spółka\n${company.name} (${company.ticker}), rynek: ${company.market}, waluta: ${company.currency}, typ: ${typeLabels[company.type] ?? company.type}`
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

// Prompt trybu „Wygeneruj od zera" (dawniej stała lokalna w NoteEditor.tsx) —
// analiza spółki jako punkt wyjścia do researchu. Wymaga companyId (kontekst
// spółki doklejany do systemu przez buildCompanyContext).
export const AI_RESEARCH_PROMPT = `Przygotuj analizę tej spółki jako punkt wyjścia do mojego researchu. Uwzględnij:
1. Profil działalności i model biznesowy
2. Kluczowe wnioski z ostatnich newsów (jeśli są w kontekście)
3. Mocne strony i przewagi konkurencyjne
4. Ryzyka i słabości
5. Katalizatory i na co zwracać uwagę w najbliższym czasie
Bądź konkretny. Jeśli czegoś nie wiesz na pewno — zaznacz to.`;

// Prompt trybu „Uzupełnij szkic" — szkic notatki (markdown, może zawierać
// szablon z pustymi sekcjami) idzie jako treść wiadomości user zaraz po tej
// instrukcji. Odpowiedź modelu ma być KOMPLETNĄ notatką, którą klient
// nadpisuje w całości (bez doklejania nagłówka „---").
export const FILL_DRAFT_INSTRUCTION = `Poniżej szkic notatki użytkownika (markdown, może zawierać szablon z pustymi sekcjami). Uzupełnij i dokończ go: wypełnij puste sekcje, zachowaj istniejącą treść i strukturę nagłówków, nie dodawaj komentarzy poza treścią notatki. Zwróć KOMPLETNĄ notatkę w markdown — całość nadpisze bieżącą.`;

// Zdanie doklejane do system promptu, gdy użytkownik włączy web search w
// modalu „Analiza AI" — wzmacnia instrukcję z pluginu `web`, żeby model
// faktycznie z niego skorzystał i cytował źródła linkami markdown.
export const webSearchSystemHint = `Masz dostęp do web searchu — użyj go, aby zweryfikować bieżące fakty (kursy, newsy, wyniki) i cytuj źródła linkami markdown.`;

// Zwraca tablicę `plugins` do body OpenRoutera dla web searchu (id "web"
// dosłownie — potwierdzone w docs OpenRoutera), albo undefined gdy wyłączony.
function buildWebPlugins(
  webSearch?: boolean
): Array<{ id: "web"; max_results: number }> | undefined {
  return webSearch ? [{ id: "web", max_results: 5 }] : undefined;
}

// Wywołanie OpenRouter — zwraca surowy Response (SSE przy stream: true).
export async function openrouterChat(
  messages: ChatMessage[],
  options: { stream?: boolean; model?: string; webSearch?: boolean } = {}
): Promise<Response> {
  const { apiKey, model: defaultModel } = getAiConfig();
  if (!apiKey) {
    throw new Error(
      "Brak klucza OpenRouter. Dodaj klucz API w Ustawieniach."
    );
  }
  const model = options.model?.trim() || defaultModel;
  const plugins = buildWebPlugins(options.webSearch);
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
      ...(plugins ? { plugins } : {}),
    }),
    signal: AbortSignal.timeout(180000),
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
