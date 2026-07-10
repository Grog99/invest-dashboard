import { db, companies, noteTemplates } from "@/db";
import { asc } from "drizzle-orm";
import {
  getSetting,
  SETTING_KEYS,
  DEFAULT_MODEL,
  DEFAULT_CRON,
  DEFAULT_NEWS_RETENTION_LIMIT,
} from "@/lib/settings";
import { seedDefaultSourcesIfEmpty } from "@/lib/news";
import { BUILTIN_TEMPLATES } from "@/lib/templates";
import { Card, PageHeader } from "@/components/ui";
import { AiSettingsForm } from "@/components/AiSettingsForm";
import { ScheduleSettingsForm } from "@/components/ScheduleSettingsForm";
import { NewsRetentionForm } from "@/components/NewsRetentionForm";
import { SourcesManager } from "@/components/SourcesManager";
import { TemplatesManager } from "@/components/TemplatesManager";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const apiKey = getSetting(SETTING_KEYS.openrouterApiKey);
  const model = getSetting(SETTING_KEYS.openrouterModel) || DEFAULT_MODEL;
  const temperature = getSetting(SETTING_KEYS.aiTemperature) ?? "";
  const topP = getSetting(SETTING_KEYS.aiTopP) ?? "";
  const reasoningEffort = getSetting(SETTING_KEYS.aiReasoningEffort) ?? "";
  const webSearchMaxResults = getSetting(SETTING_KEYS.aiWebSearchMaxResults) ?? "";
  const cronQuotes = getSetting(SETTING_KEYS.cronQuotes) ?? DEFAULT_CRON.quotes;
  const cronNews = getSetting(SETTING_KEYS.cronNews) ?? DEFAULT_CRON.news;
  const newsRetentionLimit =
    getSetting(SETTING_KEYS.newsRetentionLimit) ??
    String(DEFAULT_NEWS_RETENTION_LIMIT);
  const sources = seedDefaultSourcesIfEmpty();
  const allCompanies = db
    .select()
    .from(companies)
    .orderBy(asc(companies.ticker))
    .all();
  const userTemplates = db
    .select()
    .from(noteTemplates)
    .orderBy(asc(noteTemplates.name))
    .all();

  return (
    <div>
      <PageHeader
        title="Ustawienia"
        sub="Konfiguracja AI i źródeł newsów. Wszystkie dane trzymane są lokalnie w data/invest.db."
      />

      <div className="space-y-4">
        <Card title="AI — OpenRouter">
          <AiSettingsForm
            model={model}
            hasApiKey={!!apiKey}
            apiKeyPreview={
              apiKey ? `${apiKey.slice(0, 8)}…${apiKey.slice(-4)}` : null
            }
            temperature={temperature}
            topP={topP}
            reasoningEffort={reasoningEffort}
            webSearchMaxResults={webSearchMaxResults}
          />
        </Card>

        <Card title="Harmonogram odświeżania">
          <ScheduleSettingsForm cronQuotes={cronQuotes} cronNews={cronNews} />
        </Card>

        <Card title="Źródła newsów (RSS)">
          <SourcesManager sources={sources} companies={allCompanies} />
        </Card>

        <Card title="Retencja newsów">
          <NewsRetentionForm limit={newsRetentionLimit} />
        </Card>

        <Card title="Szablony notatek">
          <TemplatesManager templates={userTemplates} builtins={BUILTIN_TEMPLATES} />
        </Card>

        <Card title="Dane">
          <div className="space-y-1 text-[13px] text-ink2">
            <p>
              Baza danych:{" "}
              <code className="rounded bg-surface2 px-1.5 py-0.5 text-[12px]">
                data/invest.db
              </code>{" "}
              (SQLite) — kopia zapasowa to po prostu kopia tego pliku.
            </p>
            <p className="text-[12px] text-muted">
              Notowania: Yahoo Finance (opóźnione ~15 min; GPW przez sufiks
              .WA). Kursy walut: API NBP (tabela A). Newsy: kanały RSS
              skonfigurowane powyżej.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
