"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

function useRefresh(url: string, describe: (r: unknown) => string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setMessage(describe(data));
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return { busy, message, run };
}

export function RefreshQuotesButton() {
  const { busy, message, run } = useRefresh("/api/quotes/refresh", (r) => {
    const d = r as { updated: number; errors: { message: string }[] };
    const base = `Zaktualizowano ${d.updated} notowań`;
    return d.errors.length > 0
      ? `${base}; błędy: ${d.errors.map((e) => e.message).join("; ")}`
      : base;
  });
  return (
    <span className="inline-flex items-center gap-2">
      {message && (
        <span className="max-w-72 truncate text-[11px] text-muted" title={message}>
          {message}
        </span>
      )}
      <Button onClick={run} disabled={busy} size="sm">
        {busy ? "Odświeżam…" : "⟳ Odśwież notowania"}
      </Button>
    </span>
  );
}

export function RefreshNewsButton() {
  const { busy, message, run } = useRefresh("/api/news/refresh", (r) => {
    const d = r as {
      inserted: number;
      errors: { source: string; message: string }[];
    };
    const base = `${d.inserted} nowych wpisów`;
    return d.errors.length > 0
      ? `${base}; błędy: ${d.errors.map((e) => `${e.source}: ${e.message}`).join("; ")}`
      : base;
  });
  return (
    <span className="inline-flex items-center gap-2">
      {message && (
        <span className="max-w-72 truncate text-[11px] text-muted" title={message}>
          {message}
        </span>
      )}
      <Button onClick={run} disabled={busy} size="sm">
        {busy ? "Pobieram…" : "⟳ Pobierz newsy"}
      </Button>
    </span>
  );
}
