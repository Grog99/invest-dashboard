import { db, settings } from "@/db";
import { eq } from "drizzle-orm";

export const SETTING_KEYS = {
  openrouterApiKey: "openrouter_api_key",
  openrouterModel: "openrouter_model",
} as const;

export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

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
