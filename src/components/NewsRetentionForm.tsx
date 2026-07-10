"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "./ui";

export function NewsRetentionForm({ limit }: { limit: string }) {
  const router = useRouter();
  const [value, setValue] = useState(limit);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsRetentionLimit: value }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setMessage("Zapisano limit retencji.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-3">
      <div>
        <Label htmlFor="news-retention-limit">
          Limit wiadomości (per spółka i ogólne)
        </Label>
        <Input
          id="news-retention-limit"
          type="number"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="20"
        />
        <p className="mt-1 text-[11px] text-muted">
          Maksymalna liczba najnowszych wiadomości trzymanych osobno dla
          każdej spółki oraz osobno dla newsów ogólnych (bez powiązania ze
          spółką). Starsze ponad limit są automatycznie i trwale usuwane przy
          kolejnym odświeżeniu newsów. Domyślnie: 20.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Zapisuję…" : "Zapisz"}
        </Button>
        {message && <span className="text-[12px] text-muted">{message}</span>}
        {error && <span className="text-[12px] text-neg">{error}</span>}
      </div>
    </div>
  );
}
