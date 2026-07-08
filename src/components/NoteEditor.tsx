"use client";

// Edytor notatki researchowej: markdown + podgląd, przypisanie do spółki,
// generowanie analizy AI (streaming do treści).

import { useRef, useState } from "react";
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
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deleteAttachmentBusy, setDeleteAttachmentBusy] = useState(false);
  const [activeAttachmentId, setActiveAttachmentId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
            onClick={generateAi}
            disabled={aiBusy || !companyId}
            title={!companyId ? "Wybierz spółkę, aby użyć AI" : undefined}
          >
            {aiBusy ? "Generuję…" : "✦ Generuj analizę AI"}
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
    </div>
  );
}
