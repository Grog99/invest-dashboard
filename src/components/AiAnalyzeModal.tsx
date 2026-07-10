"use client";

// Modal „Analiza AI" — dwa tryby (Uzupełnij szkic / Wygeneruj od zera),
// web search, dodatkowe instrukcje, override modelu. Streaming: POST
// /api/ai/analyze przez streamAnalyze (SSE) — treść akumulowana i aplikowana
// po zakończeniu, koszt/tokeny z ostatniego chunku. Streaming zamiast dawnego
// non-streaming, żeby długa analiza nie kończyła się 504 na reverse proxy
// (patrz docs/plans/ai-analiza-504-streaming.md).

import { useState } from "react";
import { Modal } from "./Modal";
import { Button, Input, Label, Select, Textarea } from "./ui";
import { REASONING_EFFORTS, WEB_SEARCH_MAX_RESULTS } from "@/lib/ai-types";
import { streamAnalyze, type AnalyzeUsage } from "@/lib/sse";
import type { Company } from "@/db/schema";

type Mode = "fill" | "generate";

type Usage = AnalyzeUsage;

const REASONING_EFFORT_LABELS: Record<(typeof REASONING_EFFORTS)[number], string> = {
  low: "Niska (szybciej)",
  medium: "Średnia",
  high: "Wysoka (dogłębnie)",
};

// Format: "Koszt: $0.0042 · 3 210 tokenów" — pomija pola nieobecne w usage
// (patrz plan, sekcja "Prezentacja kosztu"). Zwraca null, gdy nie ma nic do
// pokazania (usage puste albo brak i cost, i totalTokens).
function formatUsageLine(usage: Usage): string | null {
  const parts: string[] = [];
  if (usage.cost != null) {
    parts.push(`Koszt: $${usage.cost.toFixed(4)}`);
  }
  if (usage.totalTokens != null) {
    parts.push(`${usage.totalTokens.toLocaleString("pl-PL")} tokenów`);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}

// Tooltip (natywny title, hover na desktopie) z rozbiciem tokenów/kosztu.
function formatUsageTooltip(usage: Usage): string {
  const lines: string[] = [];
  if (usage.promptTokens != null) lines.push(`Prompt: ${usage.promptTokens} tokenów`);
  if (usage.completionTokens != null) lines.push(`Completion: ${usage.completionTokens} tokenów`);
  if (usage.reasoningTokens != null) lines.push(`Reasoning: ${usage.reasoningTokens} tokenów`);
  if (usage.costDetails && Object.keys(usage.costDetails).length > 0) {
    for (const [key, value] of Object.entries(usage.costDetails)) {
      if (value == null) continue;
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

export function AiAnalyzeModal({
  open,
  onClose,
  content,
  companies,
  companyId,
  onCompanyIdChange,
  defaultModel,
  defaultTemperature,
  defaultTopP,
  defaultReasoningEffort,
  defaultMaxResults,
  onFillResult,
  onGenerateResult,
}: {
  open: boolean;
  onClose: () => void;
  /** Aktualna (nawet niezapisana) treść notatki z edytora. */
  content: string;
  companies: Company[];
  /** Id spółki jako string (jak w NoteEditor) lub "" gdy brak. */
  companyId: string;
  onCompanyIdChange: (id: string) => void;
  defaultModel: string;
  /** Wartości globalne z Ustawień (stringi, "" = brak) — do placeholderów. */
  defaultTemperature?: string;
  defaultTopP?: string;
  defaultReasoningEffort?: string;
  defaultMaxResults?: string;
  /** Tryb "fill": nadpisz całą treść notatki wynikiem. */
  onFillResult: (text: string) => void;
  /** Tryb "generate": doklej wynik po nagłówku "---". */
  onGenerateResult: (text: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("fill");
  const [webSearch, setWebSearch] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState("");
  const [topP, setTopP] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [maxResults, setMaxResults] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  const draftEmpty = !content.trim();
  const missingCompany = mode === "generate" && !companyId;
  const disabledReason =
    mode === "fill"
      ? draftEmpty
        ? "Notatka jest pusta — nie ma czego uzupełniać."
        : null
      : missingCompany
        ? "Wybierz spółkę, aby wygenerować analizę."
        : null;

  const close = () => {
    if (busy) return;
    setError(null);
    setUsage(null);
    onClose();
  };

  // Zmiana trybu po zakończonej analizie chowa stary koszt/błąd — nie ma
  // sensu w kontekście nowego trybu (patrz plan, Ryzyka: "stan usage/error
  // musi się czyścić przy zmianie trybu").
  const changeMode = (next: Mode) => {
    setMode(next);
    setUsage(null);
    setError(null);
  };

  const run = async () => {
    if (disabledReason) return;
    setBusy(true);
    setError(null);
    setUsage(null);
    try {
      const { content: result, usage } = await streamAnalyze({
        mode,
        draft: mode === "fill" ? content : undefined,
        companyId: companyId ? Number(companyId) : null,
        webSearch,
        model: model.trim() || undefined,
        instructions: instructions.trim() || undefined,
        temperature: temperature.trim() ? Number(temperature) : undefined,
        topP: topP.trim() ? Number(topP) : undefined,
        reasoningEffort: reasoningEffort || undefined,
        maxResults: webSearch && maxResults ? Number(maxResults) : undefined,
      });
      // Pusta treść (refusal/błąd modelu) — nie nadpisujemy notatki pustką.
      if (!result.trim()) {
        throw new Error(
          "AI nie zwróciło treści (możliwy refusal lub błąd modelu)."
        );
      }
      if (mode === "fill") {
        onFillResult(result);
      } else {
        onGenerateResult(result);
      }
      // Wynik już zaaplikowany do notatki — modal zostaje otwarty, żeby
      // pokazać koszt/tokeny; zamyka go teraz przycisk "Zamknij" (patrz
      // plan, Podejście pkt 5 — zmiana UX, modal nie zamyka się sam).
      setUsage(usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Analiza AI">
      <div className="space-y-3">
        <div>
          <Label>Tryb</Label>
          <div className="flex gap-1 rounded-lg border border-border bg-surface2 p-0.5">
            <button
              type="button"
              onClick={() => changeMode("fill")}
              className={`flex-1 cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] font-medium ${mode === "fill" ? "bg-surface text-ink" : "text-muted"}`}
            >
              Uzupełnij szkic
            </button>
            <button
              type="button"
              onClick={() => changeMode("generate")}
              className={`flex-1 cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] font-medium ${mode === "generate" ? "bg-surface text-ink" : "text-muted"}`}
            >
              Wygeneruj od zera
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {mode === "fill"
              ? "Wysyła aktualną treść notatki do AI i CAŁA odpowiedź NADPISZE notatkę."
              : "Analiza spółki jako punkt wyjścia — DOKLEJA wynik po nagłówku „---”."}
          </p>
        </div>

        <div>
          <Label htmlFor="ai-modal-company">
            Spółka {mode === "generate" ? "(wymagana)" : "(opcjonalnie)"}
          </Label>
          <Select
            id="ai-modal-company"
            value={companyId}
            onChange={(e) => onCompanyIdChange(e.target.value)}
          >
            <option value="">— brak —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ticker} — {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="flex items-start gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              checked={webSearch}
              onChange={(e) => setWebSearch(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Web search
              <span className="block text-[11px] text-muted">
                Model przeszuka internet i zacytuje źródła — dolicza się nawet przy
                darmowych modelach.
              </span>
            </span>
          </label>
        </div>

        {webSearch && (
          <div>
            <Label htmlFor="ai-modal-max-results">Liczba wyników (opcjonalnie)</Label>
            <Select
              id="ai-modal-max-results"
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
            >
              <option value="">
                Domyślne (globalne{defaultMaxResults ? `: ${defaultMaxResults}` : ""})
              </option>
              {WEB_SEARCH_MAX_RESULTS.map((n) => (
                <option key={n} value={n}>
                  {n} wyników
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-muted">
              do 10 wyników ~$0.005, każdy kolejny +$0.001.
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="ai-modal-instructions">Dodatkowe instrukcje (opcjonalnie)</Label>
          <Textarea
            id="ai-modal-instructions"
            rows={3}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="np. skup się na wycenie i ryzykach walutowych…"
          />
        </div>

        <div>
          <Label htmlFor="ai-modal-model">Model (opcjonalnie)</Label>
          <Input
            id="ai-modal-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={defaultModel}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ai-modal-temperature">Temperature (opcjonalnie)</Label>
            <Input
              id="ai-modal-temperature"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              placeholder={defaultTemperature || "domyślna modelu"}
            />
          </div>
          <div>
            <Label htmlFor="ai-modal-top-p">Top P (opcjonalnie)</Label>
            <Input
              id="ai-modal-top-p"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={topP}
              onChange={(e) => setTopP(e.target.value)}
              placeholder={defaultTopP || "domyślna modelu"}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="ai-modal-reasoning-effort">Reasoning effort (opcjonalnie)</Label>
          <Select
            id="ai-modal-reasoning-effort"
            value={reasoningEffort}
            onChange={(e) => setReasoningEffort(e.target.value)}
          >
            <option value="">
              Domyślne (globalne{defaultReasoningEffort ? `: ${defaultReasoningEffort}` : ""})
            </option>
            {REASONING_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {REASONING_EFFORT_LABELS[effort]}
              </option>
            ))}
          </Select>
        </div>

        {error && <p className="text-[12px] text-neg">{error}</p>}

        {usage && (
          <div
            className="rounded-lg border border-border bg-surface2 p-2 text-[12px] text-ink2"
            title={formatUsageTooltip(usage) || undefined}
          >
            {formatUsageLine(usage) ?? "Analiza gotowa."}
          </div>
        )}

        <div className="flex flex-col-reverse justify-end gap-2 pt-1 sm:flex-row">
          {usage ? (
            <Button variant="primary" onClick={close} className="w-full sm:w-auto">
              Zamknij
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={close} disabled={busy} className="w-full sm:w-auto">
                Anuluj
              </Button>
              <Button
                variant="primary"
                onClick={run}
                disabled={busy || !!disabledReason}
                title={disabledReason ?? undefined}
                className="w-full sm:w-auto"
              >
                {busy ? "Generuję…" : "Uruchom"}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
