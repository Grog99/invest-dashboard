"use client";

// Edytor notatki researchowej: markdown + podgląd, przypisanie do spółki,
// generowanie analizy AI (streaming do treści).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "./ui";
import { Markdown } from "./Markdown";
import { streamChat } from "@/lib/sse";
import type { Company, Note } from "@/db/schema";

const AI_RESEARCH_PROMPT = `Przygotuj analizę tej spółki jako punkt wyjścia do mojego researchu. Uwzględnij:
1. Profil działalności i model biznesowy
2. Kluczowe wnioski z ostatnich newsów (jeśli są w kontekście)
3. Mocne strony i przewagi konkurencyjne
4. Ryzyka i słabości
5. Katalizatory i na co zwracać uwagę w najbliższym czasie
Bądź konkretny. Jeśli czegoś nie wiesz na pewno — zaznacz to.`;

export function NoteEditor({
  note,
  companies,
  defaultCompanyId,
}: {
  note?: Note;
  companies: Company[];
  defaultCompanyId?: number;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(note?.title ?? "");
  const [companyId, setCompanyId] = useState(
    String(note?.companyId ?? defaultCompanyId ?? "")
  );
  const [content, setContent] = useState(note?.content ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        title,
        content,
        companyId: companyId ? Number(companyId) : null,
      };
      const res = await fetch(note ? `/api/notes/${note.id}` : "/api/notes", {
        method: note ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMessage("Zapisano.");
      if (!note) {
        router.push(`/research/${data.note.id}`);
      }
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const generateAi = async () => {
    if (!companyId) {
      setMessage("Wybierz spółkę, aby wygenerować analizę AI.");
      return;
    }
    setAiBusy(true);
    setMessage(null);
    setPreview(false);
    const company = companies.find((c) => String(c.id) === companyId);
    const header = `\n\n---\n\n## Analiza AI — ${company?.ticker ?? ""} (${new Date().toLocaleDateString("pl-PL")})\n\n`;
    setContent((prev) => (prev.trim() ? prev + header : header.trimStart()));
    try {
      await streamChat(
        {
          messages: [{ role: "user", content: AI_RESEARCH_PROMPT }],
          companyId: Number(companyId),
        },
        (delta) => setContent((prev) => prev + delta)
      );
    } catch (e) {
      setMessage(
        `Błąd AI: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_240px]">
        <div>
          <Label htmlFor="ne-title">Tytuł</Label>
          <Input
            id="ne-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="np. Teza inwestycyjna, notatki z raportu Q2…"
          />
        </div>
        <div>
          <Label htmlFor="ne-company">Spółka (opcjonalnie)</Label>
          <Select
            id="ne-company"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">— notatka ogólna —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.ticker} — {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-surface2 p-0.5">
          <button
            onClick={() => setPreview(false)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium ${!preview ? "bg-surface text-ink" : "text-muted"}`}
          >
            Edycja
          </button>
          <button
            onClick={() => setPreview(true)}
            className={`cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium ${preview ? "bg-surface text-ink" : "text-muted"}`}
          >
            Podgląd
          </button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={generateAi}
          disabled={aiBusy || !companyId}
          title={!companyId ? "Wybierz spółkę, aby użyć AI" : undefined}
        >
          {aiBusy ? "Generuję…" : "✦ Generuj analizę AI"}
        </Button>
      </div>

      {preview ? (
        <div className="min-h-64 rounded-lg border border-border bg-bg/40 p-4">
          {content.trim() ? (
            <Markdown>{content}</Markdown>
          ) : (
            <p className="text-[13px] text-muted">Pusta notatka.</p>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={18}
          placeholder="Treść notatki w markdown — nagłówki (#), listy (-), tabele, linki…"
          className="w-full rounded-lg border border-border2 bg-surface2 px-3 py-2 font-mono text-[13px] leading-relaxed text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-muted">{message}</span>
        <Button variant="primary" onClick={save} disabled={busy || !title.trim()}>
          {busy ? "Zapisuję…" : "Zapisz notatkę"}
        </Button>
      </div>
    </div>
  );
}
