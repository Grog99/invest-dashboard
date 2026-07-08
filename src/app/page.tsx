import Link from "next/link";
import {
  computePortfolio,
  portfolioValueHistory,
  benchmarkCloseHistory,
  normalizeComparison,
} from "@/lib/portfolio";
import { listNews } from "@/lib/news";
import { fmtMoney, fmtNumber, fmtPct, fmtSignedMoney, fmtDateTime } from "@/lib/format";
import {
  Card,
  StatTile,
  EmptyState,
  PageHeader,
  Badge,
} from "@/components/ui";
import { RefreshQuotesButton } from "@/components/RefreshButtons";
import { AreaChart } from "@/components/charts/AreaChart";
import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { BenchmarkChart } from "@/components/charts/BenchmarkChart";
import { BenchmarkSelect } from "@/components/BenchmarkSelect";
import { getSetting, SETTING_KEYS } from "@/lib/settings";
import { db, companies } from "@/db";
import { and, asc, eq, inArray } from "drizzle-orm";

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

export default function DashboardPage() {
  const summary = computePortfolio();
  const history = portfolioValueHistory(365);
  const news = listNews({ limit: 8 });

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

  const lastQuote = summary.holdings
    .map((h) => h.quoteUpdatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        sub={
          lastQuote
            ? `Ostatnia aktualizacja notowań: ${fmtDateTime(lastQuote)}`
            : "Brak pobranych notowań"
        }
        actions={<RefreshQuotesButton />}
      />

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
        <Card>
          <EmptyState
            title="Portfel jest pusty"
            hint="Dodaj spółki i transakcje w zakładce Portfel albo zacznij od obserwowania spółek na Watchliście."
            action={
              <div className="flex gap-2">
                <Link
                  href="/portfolio"
                  className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-deep"
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
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile
              label="Wartość portfela"
              value={fmtMoney(summary.totalValuePln)}
              sub={`koszt nabycia ${fmtMoney(summary.totalCostPln)}`}
            />
            <StatTile
              label="Dzisiaj"
              value={fmtSignedMoney(summary.totalDayChangePln)}
              sub={dayPct !== null ? fmtPct(dayPct) : undefined}
              tone={
                summary.totalDayChangePln > 0
                  ? "pos"
                  : summary.totalDayChangePln < 0
                    ? "neg"
                    : "neutral"
              }
            />
            <StatTile
              label="Wynik niezrealizowany"
              value={fmtSignedMoney(summary.totalUnrealizedPln)}
              sub={unrealizedPct !== null ? fmtPct(unrealizedPct) : undefined}
              tone={
                summary.totalUnrealizedPln > 0
                  ? "pos"
                  : summary.totalUnrealizedPln < 0
                    ? "neg"
                    : "neutral"
              }
            />
            <StatTile
              label="Zrealizowane + dywidendy"
              value={fmtSignedMoney(closedTotal)}
              sub={`w tym dywidendy ${fmtMoney(summary.totalDividendsPln)}`}
              tone={closedTotal > 0 ? "pos" : closedTotal < 0 ? "neg" : "neutral"}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-5">
            <Card
              title="Wartość portfela (12 mies.)"
              className="xl:col-span-3"
              actions={
                benchmarkOptions.length > 0 ? (
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
                )
              }
            >
              {selectedBenchmark && comparison && comparison.baseDate !== null ? (
                <>
                  <BenchmarkChart
                    portfolio={comparison.portfolio}
                    benchmark={comparison.benchmark}
                    benchmarkLabel={selectedBenchmark.ticker}
                    height={260}
                  />
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
                <AreaChart
                  data={history.map((h) => ({ time: h.date, value: h.value }))}
                  height={260}
                />
              ) : (
                <EmptyState
                  title="Za mało danych do wykresu"
                  hint="Odśwież notowania, aby pobrać historię cen."
                />
              )}
            </Card>
            <Card title="Alokacja" className="xl:col-span-2">
              <AllocationDonut
                data={summary.holdings.map((h) => ({
                  name: h.company.ticker,
                  value: h.valuePln ?? 0,
                }))}
              />
            </Card>
          </div>
        </>
      )}

      <div className="mt-4">
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
                <li key={n.id} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <a
                      href={n.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`text-[13px] leading-snug hover:text-accent hover:underline ${n.read ? "text-ink2" : "font-medium text-ink"}`}
                    >
                      {n.title}
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      {n.sourceName && <span>{n.sourceName}</span>}
                      {n.publishedAt && <span>· {fmtDateTime(n.publishedAt)}</span>}
                      {n.companies.map((c) => (
                        <Link key={c.id} href={`/companies/${c.id}`}>
                          <Badge tone="accent">{c.ticker}</Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
