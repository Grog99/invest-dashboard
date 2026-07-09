"use client";

// Zarządzanie własnymi szablonami notatek w Ustawieniach: lista z
// edycją/usuwaniem oraz formularz dodania (modal, reużyty dla dodawania i
// edycji). Szablony wbudowane (src/lib/templates.ts) są tu pokazane jako
// referencja read-only z akcją "Duplikuj do moich" — patrz
// docs/plans/szablony-tez-inwestycyjnych.md, sekcja „Podejście" pkt 4.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Button, Input, Label, Textarea, Badge, EmptyState } from "./ui";
import type { NoteTemplate } from "@/db/schema";
import type { BUILTIN_TEMPLATES } from "@/lib/templates";

// Podgląd treści w liście — jedna linia, przycięta.
function contentPreview(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  if (!flat) return "(pusta treść)";
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

export function TemplatesManager({
  templates,
  builtins,
}: {
  templates: NoteTemplate[];
  builtins: typeof BUILTIN_TEMPLATES;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NoteTemplate | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openAdd = (prefillContent = "", prefillName = "") => {
    setEditing(null);
    setName(prefillName);
    setContent(prefillContent);
    setError(null);
    setOpen(true);
  };

  const openEdit = (template: NoteTemplate) => {
    setEditing(template);
    setName(template.name);
    setContent(template.content);
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        editing ? `/api/note-templates/${editing.id}` : "/api/note-templates",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, content }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (template: NoteTemplate) => {
    if (!confirm(`Usunąć szablon "${template.name}"?`)) return;
    await fetch(`/api/note-templates/${template.id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[12px] font-medium text-ink2">Moje szablony</p>
        {templates.length === 0 ? (
          <EmptyState
            title="Brak własnych szablonów"
            hint="Dodaj własny szablon albo zduplikuj jeden z wbudowanych poniżej."
          />
        ) : (
          <ul className="divide-y divide-border">
            {templates.map((t) => (
              <li key={t.id} className="flex items-start gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-ink">{t.name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {contentPreview(t.content)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openEdit(t)}
                    className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-muted hover:bg-surface2 hover:text-ink"
                    title="Edytuj szablon"
                  >
                    Edytuj
                  </button>
                  <button
                    onClick={() => remove(t)}
                    className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-muted hover:bg-neg/10 hover:text-neg"
                    title="Usuń szablon"
                  >
                    Usuń
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Button variant="primary" size="sm" onClick={() => openAdd()}>
            Dodaj szablon
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[12px] font-medium text-ink2">Wbudowane</p>
        <ul className="divide-y divide-border">
          {builtins.map((b) => (
            <li key={b.slug} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-ink">{b.name}</span>
                  <Badge>wbudowany</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => openAdd(b.content, `${b.name} (kopia)`)}
                  className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-muted hover:bg-surface2 hover:text-ink"
                  title="Duplikuj do moich"
                >
                  Duplikuj do moich
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edytuj szablon" : "Dodaj szablon"}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="tpl-name">Nazwa</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Notatka z konferencji wynikowej"
            />
          </div>
          <div>
            <Label htmlFor="tpl-content">Treść (markdown)</Label>
            <Textarea
              id="tpl-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              className="font-mono"
              placeholder="## Sekcja&#10;treść…"
            />
          </div>
          {error && <p className="text-[12px] text-neg">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
              {busy ? "Zapisuję…" : "Zapisz"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
