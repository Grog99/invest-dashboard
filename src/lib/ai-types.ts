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
