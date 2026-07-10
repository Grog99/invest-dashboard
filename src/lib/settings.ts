import { db, settings } from "@/db";
import { eq } from "drizzle-orm";
import {
  REASONING_EFFORTS,
  type ReasoningEffort,
  WEB_SEARCH_MAX_RESULTS,
  type WebSearchMaxResults,
} from "./ai-types";

// Re-eksport dla dotychczasowych importów `from "@/lib/settings"` (route
// handlery, src/lib/ai.ts) — definicja źródłowa w ./ai-types (patrz komentarz
// tam), żeby kod kliencki mógł importować bez wciągania @/db do bundla.
export { REASONING_EFFORTS, WEB_SEARCH_MAX_RESULTS };
export type { ReasoningEffort, WebSearchMaxResults };

export const SETTING_KEYS = {
  openrouterApiKey: "openrouter_api_key",
  openrouterModel: "openrouter_model",
  aiTemperature: "ai_temperature",
  aiTopP: "ai_top_p",
  aiReasoningEffort: "ai_reasoning_effort",
  aiWebSearchMaxResults: "ai_web_search_max_results",
  cronQuotes: "cron_quotes",
  cronNews: "cron_news",
  theme: "theme",
  dashboardBenchmark: "dashboard_benchmark_company_id",
} as const;

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

// Domyślne wartości temperature/top_p/reasoning effort — puste ("" w k-v
// `settings`) = "nie wysyłaj parametru, użyj domyślnej modelu" (patrz plan
// docs/plans/openrouter-analiza-ai-config.md, sekcja "Pytania do
// doprecyzowania"). `REASONING_EFFORTS`/`ReasoningEffort` re-eksportowane
// wyżej z ./ai-types — dozwolone wartości reasoning effort, brak "startowej"
// wartości narzuconej użytkownikowi.

export const DEFAULT_CRON = {
  quotes: "*/15 9-17 * * 1-5",
  news: "*/30 * * * *",
} as const;

// Rocznik: "Dzień" (jasny papier) zatwierdzony jako motyw domyślny.
// Odwrócenie: zmień z powrotem na "dark".
export const DEFAULT_THEME = "light";

export function getSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

export function getAllSettings(): Record<string, string> {
  const rows = db.select().from(settings).all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getTheme(): "dark" | "light" {
  const value = getSetting(SETTING_KEYS.theme);
  return value === "light" ? "light" : DEFAULT_THEME;
}

// --- Walidacja/parsowanie parametrów generowania AI (temperature/top_p/
// reasoning effort) — reużywane zarówno przy odczycie domyślnych z
// Ustawień (getAiConfig w src/lib/ai.ts), jak i (w warstwie API, poza
// zakresem tej zmiany) przy walidacji override'ów z modalu "Analiza AI".
// Zakresy zgodne z planem docs/plans/openrouter-analiza-ai-config.md:
// temperature 0–2, top_p 0–1, effort ∈ {low, medium, high}.

export function isValidTemperature(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 2;
}

export function isValidTopP(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function isValidReasoningEffort(
  value: string
): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

export function isValidMaxResults(
  value: number
): value is WebSearchMaxResults {
  return (
    Number.isInteger(value) &&
    (WEB_SEARCH_MAX_RESULTS as readonly number[]).includes(value)
  );
}

// Parsuje wartość ustawienia (string z k-v `settings`, ""/null = brak) na
// number|null. Pusty, niepoprawny liczbowo lub poza zakresem string -> null
// ("nie wysyłaj parametru, użyj domyślnej modelu" — patrz plan, sekcja
// "Wartości domyślne = puste").
export function parseTemperatureSetting(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return isValidTemperature(n) ? n : null;
}

export function parseTopPSetting(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return isValidTopP(n) ? n : null;
}

export function parseReasoningEffortSetting(
  value: string | null
): ReasoningEffort | null {
  if (value == null || value.trim() === "") return null;
  return isValidReasoningEffort(value) ? value : null;
}

// Puste/null/niepoprawne -> null ("nie wysyłaj max_results, użyj domyślnej
// providera" — patrz docs/plans/ai-analysis-max-results.md, Podejście pkt 4).
export function parseMaxResultsSetting(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return isValidMaxResults(n) ? n : null;
}
