import { db, settings } from "@/db";
import { eq } from "drizzle-orm";

export const SETTING_KEYS = {
  openrouterApiKey: "openrouter_api_key",
  openrouterModel: "openrouter_model",
  cronQuotes: "cron_quotes",
  cronNews: "cron_news",
  theme: "theme",
  dashboardBenchmark: "dashboard_benchmark_company_id",
} as const;

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

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
