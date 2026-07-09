"use client";

// Modal „Analiza AI" — dwa tryby (Uzupełnij szkic / Wygeneruj od zera),
// web search, dodatkowe instrukcje, override modelu. Non-streaming — jeden
// POST /api/ai/analyze, czeka na pełną odpowiedź. Patrz
// docs/plans/ai-analiza-notatki.md, sekcja „UI (warstwa UI)".

import { useState } from "react";
import { Modal } from "./Modal";
import { Button, Input, Label, Select, Textarea } from "./ui";
import type { Company } from "@/db/schema";

type Mode = "fill" | "generate";

export function AiAnalyzeModal({
  open,
  onClose,
  content,
  companies,
  companyId,
  onCompanyIdChange,
  defaultModel,
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
  /** Tryb "fill": nadpisz całą treść notatki wynikiem. */
  onFillResult: (text: string) => void;
  /** Tryb "generate": doklej wynik po nagłówku "---". */
  onGenerateResult: (text: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("fill");
  const [webSearch, setWebSearch] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    onClose();
  };

  const run = async () => {
    if (disabledReason) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          draft: mode === "fill" ? content : undefined,
          companyId: companyId ? Number(companyId) : null,
          webSearch,
          model: model.trim() || undefined,
          instructions: instructions.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (mode === "fill") {
        onFillResult(data.content as string);
      } else {
        onGenerateResult(data.content as string);
      }
      onClose();
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
              onClick={() => setMode("fill")}
              className={`flex-1 cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] font-medium ${mode === "fill" ? "bg-surface text-ink" : "text-muted"}`}
            >
              Uzupełnij szkic
            </button>
            <button
              type="button"
              onClick={() => setMode("generate")}
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
                Model przeszuka internet i zacytuje źródła — może zwiększyć koszt zapytania.
              </span>
            </span>
          </label>
        </div>

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

        {error && <p className="text-[12px] text-neg">{error}</p>}

        <div className="flex flex-col-reverse justify-end gap-2 pt-1 sm:flex-row">
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
        </div>
      </div>
    </Modal>
  );
}
