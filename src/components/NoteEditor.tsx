"use client";

// Edytor notatki researchowej: markdown + podgląd, przypisanie do spółki,
// analiza AI przez modal (streaming SSE, patrz AiAnalyzeModal + /api/ai/analyze).

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "./ui";
import { Markdown } from "./Markdown";
import { AiAnalyzeModal } from "./AiAnalyzeModal";
import type { Company, Note } from "@/db/schema";
import type { TemplateOption } from "@/lib/templates";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
// Dopasowuje linię z pojedynczym markdownowym obrazem załącznika, np.
// "![](/api/attachments/12)" — zgodnie z formatem wstawianym przez
// insertAtCursor po uploadzie.
const ATTACHMENT_LINE_RE = /^!\[[^\]]*\]\(\/api\/attachments\/(\d+)\)\s*$/;

// Zwraca zakres [start, end) linii zawierającej pozycję `pos` w `text`
// (bez końcowego \n).
function lineRangeAt(text: string, pos: number): [number, number] {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const nextNewline = text.indexOf("\n", pos);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  return [lineStart, lineEnd];
}

export function NoteEditor({
  note,
  companies,
  defaultCompanyId,
  templates,
  defaultModel,
  defaultTemperature,
  defaultTopP,
  defaultReasoningEffort,
  defaultMaxResults,
}: {
  note?: Note;
  companies: Company[];
  defaultCompanyId?: number;
  templates?: TemplateOption[];
  defaultModel: string;
  /** Wartości domyślne z Ustawień (stringi, "" = brak) — przekazywane dalej do AiAnalyzeModal jako placeholdery. */
  defaultTemperature?: string;
  defaultTopP?: string;
  defaultReasoningEffort?: string;
  defaultMaxResults?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(note?.title ?? "");
  const [companyId, setCompanyId] = useState(
    String(note?.companyId ?? defaultCompanyId ?? "")
  );
  const [content, setContent] = useState(note?.content ?? "");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deleteAttachmentBusy, setDeleteAttachmentBusy] = useState(false);
  const [activeAttachmentId, setActiveAttachmentId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Wstawia treść wybranego szablonu (wbudowanego lub własnego) jako całą
  // treść notatki i resetuje select do placeholdera "— wstaw szablon —" —
  // patrz docs/plans/szablony-tez-inwestycyjnych.md, sekcja „Podejście" pkt 3.
  const applyTemplate = (key: string) => {
    const option = templates?.find((t) => t.key === key);
    setTemplateKey("");
    if (!option) return;
    setContent(option.content);
  };

  // Tryb "Uzupełnij szkic" (AiAnalyzeModal) — cała odpowiedź NADPISUJE treść.
  const handleFillResult = (text: string) => {
    setPreview(false);
    setContent(text);
    setMessage(null);
  };

  // Tryb "Wygeneruj od zera" (AiAnalyzeModal) — DOKLEJA po nagłówku "---".
  const handleGenerateResult = (text: string) => {
    setPreview(false);
    const company = companies.find((c) => String(c.id) === companyId);
    const header = `\n\n---\n\n## Analiza AI — ${company?.ticker ?? ""} (${new Date().toLocaleDateString("pl-PL")})\n\n`;
    setContent((prev) => (prev.trim() ? prev + header + text : header.trimStart() + text));
    setMessage(null);
  };

  // Wstawia `snippet` w miejscu kursora w textarea (fallback: doklej na
  // koniec, gdy nie mamy refa — np. tryb podglądu). Po renderze przywraca
  // focus i ustawia kursor tuż za wstawionym tekstem.
  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      setContent((prev) => prev + snippet);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const next = content.slice(0, start) + snippet + content.slice(end);
    setContent(next);
    const cursor = start + snippet.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  };

  // Przelicza id aktywnego załącznika na podstawie linii, na której aktualnie
  // stoi kursor w textarea (wołane z onSelect/onClick/onKeyUp/onChange).
  const recomputeActiveAttachment = (text: string, pos: number) => {
    const [lineStart, lineEnd] = lineRangeAt(text, pos);
    const match = ATTACHMENT_LINE_RE.exec(text.slice(lineStart, lineEnd));
    setActiveAttachmentId(match ? Number(match[1]) : null);
  };

  const handleCursorActivity = () => {
    const el = textareaRef.current;
    if (!el) return;
    recomputeActiveAttachment(content, el.selectionStart ?? 0);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    recomputeActiveAttachment(value, e.target.selectionStart ?? value.length);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // pozwala wgrać ten sam plik ponownie
    if (!file || !note) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setMessage("Plik przekracza limit 10 MB.");
      return;
    }
    setUploadBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/notes/${note.id}/attachments`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      insertAtCursor(`![](${data.url})\n`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadBusy(false);
    }
  };

  const deleteActiveAttachment = async () => {
    if (activeAttachmentId === null) return;
    setDeleteAttachmentBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/attachments/${activeAttachmentId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const pos = textareaRef.current?.selectionStart ?? 0;
      const [lineStart, lineEnd] = lineRangeAt(content, pos);
      // Usuwamy też końcowy \n linii (jeśli jest), żeby nie zostawić pustej linii.
      const removeEnd = lineEnd < content.length ? lineEnd + 1 : lineEnd;
      setContent(content.slice(0, lineStart) + content.slice(removeEnd));
      setActiveAttachmentId(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteAttachmentBusy(false);
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

      {!note && templates && templates.length > 0 && (
        <div>
          <Label htmlFor="ne-template">Szablon</Label>
          <Select
            id="ne-template"
            value={templateKey}
            onChange={(e) => applyTemplate(e.target.value)}
            disabled={content.trim().length > 0}
            className="w-full sm:max-w-xs"
          >
            <option value="">— wstaw szablon —</option>
            <optgroup label="Wbudowane">
              {templates
                .filter((t) => t.group === "builtin")
                .map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
            </optgroup>
            {templates.some((t) => t.group === "user") && (
              <optgroup label="Moje szablony">
                {templates
                  .filter((t) => t.group === "user")
                  .map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
              </optgroup>
            )}
          </Select>
          <p className="mt-1 text-[11px] text-muted">
            {content.trim().length > 0
              ? "Dostępne, gdy treść notatki jest pusta."
              : "Wstawia gotowy szkielet markdown do dalszej edycji."}
          </p>
        </div>
      )}

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
        <div className="flex items-center gap-2">
          {activeAttachmentId !== null && (
            <Button
              size="sm"
              variant="danger"
              onClick={deleteActiveAttachment}
              disabled={deleteAttachmentBusy}
            >
              {deleteAttachmentBusy ? "Usuwam…" : "Usuń obraz"}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadBusy || !note}
            title={!note ? "Zapisz notatkę, aby dodać załącznik" : undefined}
          >
            {uploadBusy ? "Wysyłam…" : "Dodaj załącznik"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAiModalOpen(true)}
          >
            ✦ Analiza AI
          </Button>
        </div>
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
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onSelect={handleCursorActivity}
          onClick={handleCursorActivity}
          onKeyUp={handleCursorActivity}
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

      <AiAnalyzeModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        content={content}
        companies={companies}
        companyId={companyId}
        onCompanyIdChange={setCompanyId}
        defaultModel={defaultModel}
        defaultTemperature={defaultTemperature}
        defaultTopP={defaultTopP}
        defaultReasoningEffort={defaultReasoningEffort}
        defaultMaxResults={defaultMaxResults}
        onFillResult={handleFillResult}
        onGenerateResult={handleGenerateResult}
      />
    </div>
  );
}
