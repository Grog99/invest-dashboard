"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "./ui";
import {
  REASONING_EFFORTS,
  type ReasoningEffort,
  WEB_SEARCH_MAX_RESULTS,
} from "@/lib/ai-types";

const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  low: "Niska (szybciej)",
  medium: "Średnia",
  high: "Wysoka (dogłębnie)",
};

export function AiSettingsForm({
  model,
  hasApiKey,
  apiKeyPreview,
  temperature,
  topP,
  reasoningEffort,
  webSearchMaxResults,
}: {
  model: string;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  /** Stringi z k-v `settings`; "" = brak ustawienia (użyj domyślnej modelu). */
  temperature: string;
  topP: string;
  reasoningEffort: string;
  webSearchMaxResults: string;
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [modelValue, setModelValue] = useState(model);
  const [temperatureValue, setTemperatureValue] = useState(temperature);
  const [topPValue, setTopPValue] = useState(topP);
  const [reasoningEffortValue, setReasoningEffortValue] = useState(reasoningEffort);
  const [webSearchMaxResultsValue, setWebSearchMaxResultsValue] = useState(
    webSearchMaxResults
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, string> = {
        model: modelValue,
        temperature: temperatureValue.trim(),
        topP: topPValue.trim(),
        reasoningEffort: reasoningEffortValue.trim(),
        webSearchMaxResults: webSearchMaxResultsValue.trim(),
      };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMessage("Zapisano ustawienia.");
      setApiKey("");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-3">
      <div>
        <Label htmlFor="ai-key">Klucz API OpenRouter</Label>
        <Input
          id="ai-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            hasApiKey
              ? `zapisany: ${apiKeyPreview} — wpisz nowy, aby podmienić`
              : "sk-or-…"
          }
        />
        <p className="mt-1 text-[11px] text-muted">
          Klucz znajdziesz na{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            openrouter.ai/keys
          </a>
          . Przechowywany wyłącznie lokalnie, w pliku bazy na Twoim dysku.
        </p>
      </div>
      <div>
        <Label htmlFor="ai-model">Model</Label>
        <Input
          id="ai-model"
          value={modelValue}
          onChange={(e) => setModelValue(e.target.value)}
          placeholder="anthropic/claude-sonnet-4.5"
        />
        <p className="mt-1 text-[11px] text-muted">
          Identyfikator modelu z{" "}
          <a
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            openrouter.ai/models
          </a>
          , np. anthropic/claude-sonnet-4.5, openai/gpt-4o, google/gemini-2.5-pro.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="ai-temperature">Temperature</Label>
          <Input
            id="ai-temperature"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={temperatureValue}
            onChange={(e) => setTemperatureValue(e.target.value)}
            placeholder="domyślna modelu"
          />
          <p className="mt-1 text-[11px] text-muted">
            0–2. Wyższa wartość = bardziej kreatywne odpowiedzi. Puste = nie wysyłaj (domyślna modelu).
          </p>
        </div>
        <div>
          <Label htmlFor="ai-top-p">Top P</Label>
          <Input
            id="ai-top-p"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={topPValue}
            onChange={(e) => setTopPValue(e.target.value)}
            placeholder="domyślna modelu"
          />
          <p className="mt-1 text-[11px] text-muted">
            0–1. Ogranicza pulę tokenów do wyboru. Puste = nie wysyłaj (domyślna modelu).
          </p>
        </div>
      </div>
      <div>
        <Label htmlFor="ai-reasoning-effort">Reasoning effort</Label>
        <Select
          id="ai-reasoning-effort"
          value={reasoningEffortValue}
          onChange={(e) => setReasoningEffortValue(e.target.value)}
        >
          <option value="">Domyślne modelu</option>
          {REASONING_EFFORTS.map((effort) => (
            <option key={effort} value={effort}>
              {REASONING_EFFORT_LABELS[effort]}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-[11px] text-muted">
          Głębokość „myślenia” modelu (jeśli wspiera). Puste = nie wysyłaj (domyślna modelu).
        </p>
      </div>
      <div>
        <Label htmlFor="ai-web-search-max-results">Liczba wyników web searchu</Label>
        <Select
          id="ai-web-search-max-results"
          value={webSearchMaxResultsValue}
          onChange={(e) => setWebSearchMaxResultsValue(e.target.value)}
        >
          <option value="">Domyślne providera (5 wyników)</option>
          {WEB_SEARCH_MAX_RESULTS.map((n) => (
            <option key={n} value={n}>
              {n} wyników
            </option>
          ))}
        </Select>
        <p className="mt-1 text-[11px] text-muted">
          Liczba stron przeszukiwanych podczas analizy AI z web searchem — domyślna dla
          nowych analiz (można nadpisać w modalu „Analiza AI”). Więcej wyników = wyższy
          koszt i dłuższy czas zapytania.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Zapisuję…" : "Zapisz"}
        </Button>
        {message && <span className="text-[12px] text-muted">{message}</span>}
      </div>
    </div>
  );
}
