"use client";

// Zarządzanie źródłami newsów: lista z włącz/wyłącz i usuwaniem oraz
// formularz dodania nowego kanału RSS (globalnego lub per spółka).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select, Badge } from "./ui";
import type { Company, NewsSource } from "@/db/schema";

export function SourcesManager({
  sources,
  companies,
}: {
  sources: NewsSource[];
  companies: Company[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const companyById = new Map(companies.map((c) => [c.id, c]));

  const add = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/news-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          url,
          companyId: companyId ? Number(companyId) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMessage(`Dodano źródło (${data.itemCount} wpisów w kanale).`);
      setName("");
      setUrl("");
      setCompanyId("");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (source: NewsSource) => {
    await fetch(`/api/news-sources/${source.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: source.enabled !== 1 }),
    });
    router.refresh();
  };

  const remove = async (source: NewsSource) => {
    if (!confirm(`Usunąć źródło "${source.name}"?`)) return;
    await fetch(`/api/news-sources/${source.id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border">
        {sources.map((s) => {
          const company = s.companyId ? companyById.get(s.companyId) : null;
          return (
            <li key={s.id} className="flex items-center gap-3 py-2.5">
              <label className="flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={s.enabled === 1}
                  onChange={() => toggle(s)}
                  className="accent-accent"
                  title={s.enabled === 1 ? "Wyłącz źródło" : "Włącz źródło"}
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[13px] font-medium ${s.enabled === 1 ? "text-ink" : "text-muted line-through"}`}
                  >
                    {s.name}
                  </span>
                  {company && <Badge tone="accent">{company.ticker}</Badge>}
                </div>
                <div className="truncate text-[11px] text-muted">{s.url}</div>
                {s.lastError && (
                  <div className="mt-0.5 text-[11px] text-neg">
                    Ostatni błąd: {s.lastError}
                  </div>
                )}
              </div>
              <button
                onClick={() => remove(s)}
                className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-muted hover:bg-neg/10 hover:text-neg"
                title="Usuń źródło"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded-lg border border-border bg-bg/40 p-3">
        <p className="mb-2 text-[12px] font-medium text-ink2">
          Dodaj kanał RSS
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="src-name">Nazwa</Label>
            <Input
              id="src-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Stockwatch — komunikaty"
            />
          </div>
          <div>
            <Label htmlFor="src-company">Przypisz do spółki (opcjonalnie)</Label>
            <Select
              id="src-company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">— źródło ogólne —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ticker} — {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-3">
          <Label htmlFor="src-url">Adres URL kanału RSS/Atom</Label>
          <Input
            id="src-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/rss.xml"
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={add}
            disabled={busy || !name.trim() || !url.trim()}
          >
            {busy ? "Sprawdzam kanał…" : "Dodaj źródło"}
          </Button>
          {message && <span className="text-[12px] text-muted">{message}</span>}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Źródło przypisane do spółki: wszystkie wpisy trafiają do tej spółki
          (np. RSS relacji inwestorskich). Źródło ogólne: wpisy są dopasowywane
          do spółek po tickerze, nazwie i aliasach.
        </p>
      </div>
    </div>
  );
}
