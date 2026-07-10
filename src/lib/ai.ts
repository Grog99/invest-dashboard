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
import {
  getSetting,
  SETTING_KEYS,
  DEFAULT_MODEL,
  parseTemperatureSetting,
  parseTopPSetting,
  parseReasoningEffortSetting,
  parseMaxResultsSetting,
  type ReasoningEffort,
} from "./settings";
import { computePortfolio } from "./portfolio";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function getAiConfig(): {
  apiKey: string | null;
  model: string;
  temperature: number | null;
  topP: number | null;
  reasoningEffort: ReasoningEffort | null;
  webSearchMaxResults: number | null;
} {
  return {
    apiKey: getSetting(SETTING_KEYS.openrouterApiKey),
    model: getSetting(SETTING_KEYS.openrouterModel) || DEFAULT_MODEL,
    temperature: parseTemperatureSetting(
      getSetting(SETTING_KEYS.aiTemperature)
    ),
    topP: parseTopPSetting(getSetting(SETTING_KEYS.aiTopP)),
    reasoningEffort: parseReasoningEffortSetting(
      getSetting(SETTING_KEYS.aiReasoningEffort)
    ),
    webSearchMaxResults: parseMaxResultsSetting(
      getSetting(SETTING_KEYS.aiWebSearchMaxResults)
    ),
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
// `maxResults` sterowalne (override z modalu ?? domyślna z Ustawień) — gdy
// null/undefined, pole `max_results` jest pomijane w body i OpenRouter
// stosuje swoją domyślną (5), czyli zachowanie tożsame z dawnym hardcodem.
function buildWebPlugins(
  webSearch?: boolean,
  maxResults?: number | null
): Array<{ id: "web"; max_results?: number }> | undefined {
  return webSearch
    ? [{ id: "web", ...(maxResults != null ? { max_results: maxResults } : {}) }]
    : undefined;
}

// Buduje pole `reasoning` do body OpenRoutera — wzorowane 1:1 na
// buildWebPlugins powyżej. Tylko `effort` (non-goal: max_tokens/exclude,
// patrz plan). undefined = pole pominięte w body (model użyje swojej
// domyślnej głębokości myślenia).
function buildReasoning(
  effort?: ReasoningEffort | null
): { effort: ReasoningEffort } | undefined {
  return effort ? { effort } : undefined;
}

// Wywołanie OpenRouter — zwraca surowy Response (SSE przy stream: true).
// Efektywna wartość każdego opcjonalnego parametru: override z `options` ??
// domyślna z Ustawień (getAiConfig) ?? pominięcie parametru w body (patrz
// plan docs/plans/openrouter-analiza-ai-config.md, Podejście pkt 1).
export async function openrouterChat(
  messages: ChatMessage[],
  options: {
    stream?: boolean;
    model?: string;
    webSearch?: boolean;
    temperature?: number;
    topP?: number;
    reasoning?: ReasoningEffort;
    maxResults?: number;
    // Dolicza blok `usage` (koszt/tokeny) do odpowiedzi. Przy stream:true
    // OpenRouter dosyła go w ostatnim chunku SSE (usaccounting per plan).
    includeUsage?: boolean;
  } = {}
): Promise<Response> {
  const {
    apiKey,
    model: defaultModel,
    temperature: defaultTemperature,
    topP: defaultTopP,
    reasoningEffort: defaultReasoningEffort,
    webSearchMaxResults,
  } = getAiConfig();
  if (!apiKey) {
    throw new Error(
      "Brak klucza OpenRouter. Dodaj klucz API w Ustawieniach."
    );
  }
  const model = options.model?.trim() || defaultModel;
  const plugins = buildWebPlugins(
    options.webSearch,
    options.maxResults ?? webSearchMaxResults ?? undefined
  );
  const temperature = options.temperature ?? defaultTemperature ?? undefined;
  const topP = options.topP ?? defaultTopP ?? undefined;
  const reasoning = buildReasoning(
    options.reasoning ?? defaultReasoningEffort ?? undefined
  );
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
      ...(temperature != null ? { temperature } : {}),
      ...(topP != null ? { top_p: topP } : {}),
      ...(reasoning ? { reasoning } : {}),
      ...(options.includeUsage ? { usage: { include: true } } : {}),
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
