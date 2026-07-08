import Link from "next/link";
import {
  computePortfolio,
  portfolioValueHistory,
  benchmarkCloseHistory,
  normalizeComparison,
} from "@/lib/portfolio";
import { listNews } from "@/lib/news";
import { fmtMoney, fmtNumber, fmtPct, fmtSignedMoney, fmtDateTime } from "@/lib/format";
import { Card, EmptyState, Badge } from "@/components/ui";
import { RefreshQuotesButton } from "@/components/RefreshButtons";
import { AreaChart } from "@/components/charts/AreaChart";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { BenchmarkChart } from "@/components/charts/BenchmarkChart";
import { BenchmarkSelect } from "@/components/BenchmarkSelect";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { db, companies } from "@/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { ReactNode } from "react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { getLogoFlags } from "@/lib/logos";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  STOCK: "Akcje",
  ETF: "ETF",
  INDEX: "Indeks",
};

function returnToneClass(value: number): string {
  return value > 0.000001 ? "text-pos" : value < -0.000001 ? "text-neg" : "text-ink2";
}

// Różnica stóp zwrotu w punktach procentowych — jak fmtPct, ale bez "%".
function fmtPp(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${fmtNumber(value, 1)} pp`;
}

// Wiersz „wyciągu" — etykieta, kropkowany leader, kwota ze znakiem + procent.
function LedgerRow({
  label,
  amount,
  tone,
  note,
  isLast = false,
}: {
  label: string;
  amount: string;
  tone: string;
  note?: ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 ${
        isLast ? "" : "border-b border-border"
      }`}
    >
      <span className="text-[14.5px] text-ink2">{label}</span>
      <span
        aria-hidden
        className="hidden min-w-8 flex-1 -translate-y-1 border-b border-dotted border-border sm:block"
      />
      <span className={`text-[17px] font-bold tabular-nums ${tone}`}>
        {amount}
        {note && <span className="ml-2 text-[12.5px] font-medium text-ink2">{note}</span>}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const summary = computePortfolio();
  const history = portfolioValueHistory(365);
  const news = listNews({ limit: 8 });
  const newsLogoFlags = getLogoFlags(
    [...new Set(news.flatMap((n) => n.companies.map((c) => c.id)))]
  );

  const benchmarkId = Number(getSetting(SETTING_KEYS.dashboardBenchmark)) || null;
  const benchmarkCandidates = db
    .select()
    .from(companies)
    .where(and(eq(companies.watchlist, 1), inArray(companies.type, ["INDEX", "ETF"])))
    .orderBy(asc(companies.ticker))
    .all();
  const benchmarkOptions = benchmarkCandidates.map((c) => ({
    id: c.id,
    label: `${c.ticker} · ${TYPE_LABELS[c.type] ?? c.type}`,
  }));
  // Zapamiętane id może wskazywać spółkę usuniętą lub zmienioną na STOCK —
  // wtedy defensywnie traktujemy wybór jak "brak".
  const selectedBenchmark = benchmarkId
    ? (benchmarkCandidates.find((c) => c.id === benchmarkId) ?? null)
    : null;
  const comparison = selectedBenchmark
    ? normalizeComparison(history, benchmarkCloseHistory(selectedBenchmark.id, 365))
    : null;

  const hasHoldings = summary.holdings.length > 0;
  const dayBase = summary.totalValuePln - summary.totalDayChangePln;
  const dayPct = dayBase > 0 ? (summary.totalDayChangePln / dayBase) * 100 : null;
  const unrealizedPct =
    summary.totalCostPln > 0
      ? (summary.totalUnrealizedPln / summary.totalCostPln) * 100
      : null;
  const closedTotal = summary.totalRealizedPln + summary.totalDividendsPln;
  const dayTone = returnToneClass(summary.totalDayChangePln);
  const dayArrow = summary.totalDayChangePln > 0 ? "▲" : summary.totalDayChangePln < 0 ? "▼" : "•";

  const lastQuote = summary.holdings
    .map((h) => h.quoteUpdatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const dateLine = lastQuote
    ? `Ostatnia aktualizacja notowań: ${fmtDateTime(lastQuote)}`
    : "Brak pobranych notowań";

  const newsCard = (
    <Card
      title="Ostatnie newsy"
      actions={
        <Link href="/news" className="text-[12px] text-accent hover:underline">
          wszystkie →
        </Link>
      }
    >
      {news.length === 0 ? (
        <EmptyState
          title="Brak newsów"
          hint="Pobierz newsy w zakładce Newsy — domyślne źródła (ESPI, Bankier, Strefa Inwestorów) skonfigurują się same."
        />
      ) : (
        <ul className="divide-y divide-border">
          {news.map((n) => (
            <li key={n.id} className="py-2.5">
              <a
                href={n.url}
                target="_blank"
                rel="noreferrer"
                className={`font-serif text-[15px] leading-snug hover:text-accent hover:underline ${n.read ? "font-medium text-ink2" : "font-semibold text-ink"}`}
              >
                {n.title}
              </a>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
                {n.sourceName && <span>{n.sourceName}</span>}
                {n.publishedAt && <span>· {fmtDateTime(n.publishedAt)}</span>}
                {n.companies.map((c) => (
                  <Link
                    key={c.id}
                    href={`/companies/${c.id}`}
                    className="inline-flex items-center gap-1 normal-case tracking-normal"
                  >
                    <CompanyLogo
                      ticker={c.ticker}
                      name={c.ticker}
                      companyId={c.id}
                      hasLogo={newsLogoFlags.get(c.id) ?? false}
                    />
                    <Badge tone="accent">{c.ticker}</Badge>
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );

  return (
    <div>
      {/* Masthead */}
      <div className="mb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink sm:text-[26px]">
            Dashboard
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[12px] text-ink2">{dateLine}</span>
            <RefreshQuotesButton />
          </div>
        </div>
        <div className="mt-2.5 h-[3px] border-t-2 border-b border-ink" />
      </div>

      {summary.warnings.length > 0 && (
        <div className="mb-4 space-y-1 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3">
          {summary.warnings.map((w, i) => (
            <p key={i} className="text-[12px] text-warn">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {!hasHoldings ? (
        <>
          <Card>
            <EmptyState
              title="Portfel jest pusty"
              hint="Dodaj spółki i transakcje w zakładce Portfel albo zacznij od obserwowania spółek na Watchliście."
              action={
                <div className="flex gap-2">
                  <Link
                    href="/portfolio"
                    className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-accent-ink hover:bg-accent-deep"
                  >
                    Przejdź do portfela
                  </Link>
                  <Link
                    href="/watchlist"
                    className="rounded-lg border border-border2 bg-surface2 px-3.5 py-1.5 text-[13px] font-medium text-ink hover:border-muted"
                  >
                    Watchlista
                  </Link>
                </div>
              }
            />
          </Card>
          <div className="mt-4">{newsCard}</div>
        </>
      ) : (
        <>
          {/* Hero „Karta majątku" */}
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink2">
                  Wartość portfela
                </div>
                <div className="mt-1.5 font-serif text-[clamp(2.25rem,7vw,4.5rem)] leading-none tracking-tight text-ink tabular-nums">
                  {fmtMoney(summary.totalValuePln)}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-ink2 tabular-nums">
                  <span>Koszt nabycia {fmtMoney(summary.totalCostPln)}</span>
                  {unrealizedPct !== null && (
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold ${
                        unrealizedPct > 0
                          ? "bg-pos/15 text-pos"
                          : unrealizedPct < 0
                            ? "bg-neg/15 text-neg"
                            : "bg-surface2 text-ink2"
                      }`}
                    >
                      niezrealizowane {fmtPct(unrealizedPct, 1)}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink2">
                  Wynik sesji
                </div>
                <div className={`mt-1.5 text-[28px] font-bold tracking-tight tabular-nums sm:text-[30px] ${dayTone}`}>
                  {fmtSignedMoney(summary.totalDayChangePln)}
                </div>
                {dayPct !== null && (
                  <div className={`mt-0.5 text-[13px] tabular-nums ${dayTone}`}>
                    {dayArrow} {fmtPct(dayPct)}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex justify-end">
                {benchmarkOptions.length > 0 ? (
                  <BenchmarkSelect
                    options={benchmarkOptions}
                    selectedId={selectedBenchmark?.id ?? null}
                  />
                ) : (
                  <Link
                    href="/watchlist"
                    className="text-[12px] text-accent hover:underline"
                  >
                    Dodaj indeks/ETF na Watchliście →
                  </Link>
                )}
              </div>

              {selectedBenchmark && comparison && comparison.baseDate !== null ? (
                <>
                  <BenchmarkChart
                    portfolio={comparison.portfolio}
                    benchmark={comparison.benchmark}
                    benchmarkLabel={selectedBenchmark.ticker}
                    height={260}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-1.5 text-[11px] text-ink2">
                    <span>Wykr. 1 — wartość portfela, 12 mies.</span>
                  </div>
                  {comparison.portfolioReturnPct !== null &&
                    comparison.benchmarkReturnPct !== null && (
                      <p className="mt-2 text-[12px]">
                        <span className={returnToneClass(comparison.portfolioReturnPct)}>
                          Portfel {fmtPct(comparison.portfolioReturnPct)}
                        </span>
                        <span className="text-muted"> · </span>
                        <span className={returnToneClass(comparison.benchmarkReturnPct)}>
                          {selectedBenchmark.ticker} {fmtPct(comparison.benchmarkReturnPct)}
                        </span>
                        <span className="text-muted"> · </span>
                        <span
                          className={returnToneClass(
                            comparison.portfolioReturnPct - comparison.benchmarkReturnPct
                          )}
                        >
                          {fmtPp(
                            comparison.portfolioReturnPct - comparison.benchmarkReturnPct
                          )}
                        </span>
                      </p>
                    )}
                  <p className="mt-1 text-[11px] text-muted">
                    Porównanie krzywej wartości, nie uwzględnia wpłat/wypłat w
                    trakcie okresu (pełna stopa zwrotu TWR/XIRR — poza zakresem).
                  </p>
                </>
              ) : selectedBenchmark ? (
                <EmptyState
                  title="Za mało wspólnych danych do porównania"
                  hint="Portfel i benchmark nie mają nakładającego się okresu w ciągu ostatnich 12 miesięcy — odśwież notowania."
                />
              ) : history.length > 1 ? (
                <>
                  <AreaChart
                    data={history.map((h) => ({ time: h.date, value: h.value }))}
                    colorToken="ink"
                    height={260}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-1.5 text-[11px] text-ink2">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block h-0 w-5 border-t-[2.5px] border-ink"
                      />
                      Portfel
                    </span>
                    <span>Wykr. 1 — wartość portfela, 12 mies.</span>
                  </div>
                </>
              ) : (
                <EmptyState
                  title="Za mało danych do wykresu"
                  hint="Odśwież notowania, aby pobrać historię cen."
                />
              )}
            </div>
          </div>

          {/* Ledger */}
          <div className="mt-5 rounded-2xl border border-border bg-surface px-5 sm:px-6">
            <LedgerRow
              label="Wynik niezrealizowany"
              amount={fmtSignedMoney(summary.totalUnrealizedPln)}
              tone={returnToneClass(summary.totalUnrealizedPln)}
              note={unrealizedPct !== null ? fmtPct(unrealizedPct) : undefined}
            />
            <LedgerRow
              label="Zrealizowane + dywidendy"
              amount={fmtSignedMoney(closedTotal)}
              tone={returnToneClass(closedTotal)}
              note={`w tym dyw. ${fmtMoney(summary.totalDividendsPln)}`}
              isLast
            />
          </div>

          {/* Dwie kolumny */}
          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card title="Alokacja" className="lg:col-span-2">
              <AllocationDonut
                data={summary.holdings.map((h) => ({
                  name: h.company.ticker,
                  value: h.valuePln ?? 0,
                }))}
              />
            </Card>
            <div className="lg:col-span-3">{newsCard}</div>
          </div>
        </>
      )}

      {/* Colophon */}
      <div className="mt-8 border-t-2 border-ink pt-2 pb-1 text-center text-[11px] uppercase tracking-widest text-ink2">
        Invest Rocznik · wydanie prywatne · dane: Yahoo · Stooq · Bankier
      </div>
    </div>
  );
}
