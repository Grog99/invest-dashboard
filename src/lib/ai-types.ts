// Typy/stałe współdzielone między serwerem a klientem dla parametrów
// generowania AI (temperature/top_p/reasoning effort). Wydzielone z
// src/lib/settings.ts, żeby komponenty kliencie (np. AiSettingsForm,
// AiAnalyzeModal) mogły reużyć `REASONING_EFFORTS`/`ReasoningEffort` bez
// wciągania do bundla przeglądarki modułu `@/db` (better-sqlite3, Node-only)
// zaimportowanego na szczycie settings.ts. `src/lib/settings.ts` re-eksportuje
// oba symbole, więc istniejący import z "@/lib/settings" w kodzie serwerowym
// (route handlery, src/lib/ai.ts) działa bez zmian.

export const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

// Dozwolone wartości `max_results` pluginu `web` (liczba stron przeszukiwanych
// przez web search OpenRoutera) — Select z gotowymi opcjami (nie dowolna
// liczba), patrz docs/plans/ai-analysis-max-results.md. Domyślna providera
// (gdy parametr pominięty w body) to 5.
export const WEB_SEARCH_MAX_RESULTS = [3, 5, 10, 15, 20] as const;
export type WebSearchMaxResults = (typeof WEB_SEARCH_MAX_RESULTS)[number];
