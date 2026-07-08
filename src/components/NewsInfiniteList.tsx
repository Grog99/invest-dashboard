"use client";

// Infinite scroll dla /news: pierwsza porcja przychodzi server-side (props),
// kolejne dokleja IntersectionObserver + GET /api/news?cursor=…
// Odczyt/toggle "przeczytane" jest lokalny (optimistic PATCH), bez
// router.refresh() — inaczej doklejone strony rozjechałyby się przy każdym
// pojedynczym toggle (patrz Ryzyka w docs/plans/paginacja-newsow.md).
//
// Stan (items/cursor/done) żyje tylko w tym komponencie i nigdy nie jest
// synchronizowany "wstecz" z propsami po zamontowaniu — reset do świeżej
// pierwszej porcji (zmiana filtra, "Oznacz wszystkie jako przeczytane",
// "Pobierz newsy") dzieje się przez `key` w src/app/news/page.tsx, które
// wymusza pełny remount z nowymi initialItems/initialCursor.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "./ui";
import { fmtDateTime } from "@/lib/format";
import type { NewsListItem } from "@/lib/news";

export function NewsInfiniteList({
  initialItems,
  initialCursor,
  companyId,
  unreadOnly,
  onlyMyCompanies,
}: {
  initialItems: NewsListItem[];
  initialCursor: string | null;
  companyId?: number;
  unreadOnly: boolean;
  onlyMyCompanies: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initialCursor === null);
  const [error, setError] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);

  async function loadMore() {
    if (loading || done || !cursor) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ cursor, limit: "50" });
      if (companyId) params.set("company", String(companyId));
      if (unreadOnly) params.set("unread", "1");
      if (onlyMyCompanies) params.set("mine", "1");
      const res = await fetch(`/api/news?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        items: NewsListItem[];
        nextCursor: string | null;
      };
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      if (data.nextCursor === null) setDone(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || done) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, loading, cursor]);

  async function applyRead(item: NewsListItem, nextRead: boolean) {
    setBusyIds((prev) => new Set(prev).add(item.id));
    setItems((prev) =>
      unreadOnly && nextRead
        ? prev.filter((it) => it.id !== item.id)
        : prev.map((it) =>
            it.id === item.id ? { ...it, read: nextRead } : it
          )
    );
    try {
      await fetch("/api/news", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, read: nextRead }),
        keepalive: true,
      });
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function toggleRead(item: NewsListItem) {
    await applyRead(item, !item.read);
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  if (!n.read) void applyRead(n, true);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1 && !n.read) void applyRead(n, true);
                }}
                className={`text-[13.5px] leading-snug hover:text-accent hover:underline ${n.read ? "font-medium text-ink2" : "font-semibold text-ink"}`}
              >
                {n.title}
              </a>
              {n.summary && (
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">
                  {n.summary}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                {n.sourceName && <span>{n.sourceName}</span>}
                {n.publishedAt && <span>· {fmtDateTime(n.publishedAt)}</span>}
                {n.companies.length === 0 ? (
                  <Badge size="md" tone="neutral">
                    Ogólne
                  </Badge>
                ) : (
                  n.companies.map((c) => (
                    <Link key={c.id} href={`/companies/${c.id}`}>
                      <Badge size="md" tone="accent">
                        {c.ticker}
                      </Badge>
                    </Link>
                  ))
                )}
              </div>
            </div>
            <button
              onClick={() => void toggleRead(n)}
              disabled={busyIds.has(n.id)}
              title={n.read ? "Oznacz jako nieprzeczytane" : "Oznacz jako przeczytane"}
              className={`cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                n.read ? "text-muted hover:text-ink2" : "text-accent hover:text-ink"
              }`}
            >
              {n.read ? "↺" : "✓"}
            </button>
          </li>
        ))}
      </ul>
      <div
        ref={sentinelRef}
        className="py-3 text-center text-[12px] text-muted"
      >
        {loading && "Ładowanie…"}
        {!loading && done && !error && "Koniec historii"}
        {error && (
          <span className="inline-flex items-center gap-2 text-neg">
            Nie udało się załadować.
            <button
              onClick={() => void loadMore()}
              className="cursor-pointer rounded-md border border-neg/40 px-2 py-0.5 text-[11px] hover:bg-neg/10"
            >
              Ponów
            </button>
          </span>
        )}
      </div>
    </>
  );
}
