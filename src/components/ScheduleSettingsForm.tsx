"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "./ui";

export function ScheduleSettingsForm({
  cronQuotes,
  cronNews,
}: {
  cronQuotes: string;
  cronNews: string;
}) {
  const router = useRouter();
  const [quotesValue, setQuotesValue] = useState(cronQuotes);
  const [newsValue, setNewsValue] = useState(cronNews);
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
        body: JSON.stringify({
          cronQuotes: quotesValue,
          cronNews: newsValue,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setMessage("Zapisano harmonogram.");
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
        <Label htmlFor="cron-quotes">Cron notowań</Label>
        <Input
          id="cron-quotes"
          value={quotesValue}
          onChange={(e) => setQuotesValue(e.target.value)}
          placeholder="*/15 9-17 * * 1-5"
        />
        <p className="mt-1 text-[11px] text-muted">
          Składnia cron (min godz dzień-miesiąca miesiąc dzień-tygodnia).
          Puste pole = wyłączone. Domyślnie: */15 9-17 * * 1-5 (co 15 min, godziny sesji GPW, pn–pt).
        </p>
      </div>
      <div>
        <Label htmlFor="cron-news">Cron newsów</Label>
        <Input
          id="cron-news"
          value={newsValue}
          onChange={(e) => setNewsValue(e.target.value)}
          placeholder="*/30 * * * *"
        />
        <p className="mt-1 text-[11px] text-muted">
          Puste pole = wyłączone. Domyślnie: */30 * * * * (co 30 min, cały czas).
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
