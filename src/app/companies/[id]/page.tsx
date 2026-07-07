import Link from "next/link";
import { notFound } from "next/navigation";
import {
  db,
  companies,
  transactions,
  quotesLatest,
  quotesDaily,
  notes,
} from "@/db";
import { and, asc, desc, eq, gte } from "drizzle-orm";
import { computePortfolio } from "@/lib/portfolio";
import { listNews } from "@/lib/news";
import {
  fmtMoney,
  fmtNumber,
  fmtQty,
  fmtDate,
  fmtDateTime,
  fmtPct,
} from "@/lib/format";
import {
  Card,
  PageHeader,
  StatTile,
  Table,
  Th,
  Td,
  Delta,
  Badge,
  EmptyState,
} from "@/components/ui";
import { RefreshQuotesButton } from "@/components/RefreshButtons";
import { CompanyModalButton } from "@/components/CompanyForm";
import { TransactionModalButton } from "@/components/TransactionForm";
import { TransactionEditButton } from "@/components/TransactionEditButton";
import { DeleteButton } from "@/components/DeleteButton";
import { WatchlistToggle } from "@/components/WatchlistToggle";
import { PriceChart } from "@/components/charts/PriceChart";
import { AiChat } from "@/components/AiChat";
import { NewsReadToggle } from "@/components/NewsActions";

export const dynamic = "force-dynamic";

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = Number(id);
  const company = db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .get();
  if (!company) notFound();

  const quote = db
    .select()
    .from(quotesLatest)
    .where(eq(quotesLatest.companyId, companyId))
    .get();

  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  const bars = db
    .select({ date: quotesDaily.date, close: quotesDaily.close })
    .from(quotesDaily)
    .where(
      and(
        eq(quotesDaily.companyId, companyId),
        gte(quotesDaily.date, fiveYearsAgo.toISOString().slice(0, 10))
      )
    )
    .orderBy(asc(quotesDaily.date))
    .all();

  const holding = computePortfolio().holdings.find(
    (h) => h.company.id === companyId
  );
  const companyTx = db
    .select()
    .from(transactions)
    .where(eq(transactions.companyId, companyId))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();
  const companyNotes = db
    .select()
    .from(notes)
    .where(eq(notes.companyId, companyId))
    .orderBy(desc(notes.updatedAt))
    .all();
  const news = listNews({ companyId, limit: 15 });
  const allCompanies = db
    .select()
    .from(companies)
    .orderBy(asc(companies.ticker))
    .all();

  const dayPct =
    quote?.price !== undefined && quote?.prevClose
      ? ((quote.price - quote.prevClose) / quote.prevClose) * 100
      : null;

  return (
    <div>
      <PageHeader
        title={`${company.ticker} — ${company.name}`}
        sub={
          <span className="inline-flex items-center gap-1.5">
            <Badge>{company.market}</Badge>
            <Badge>{company.currency}</Badge>
            <Badge tone="neutral">Symbol: {company.quoteSymbol}</Badge>
            {quote && (
              <span className="ml-1">
                aktualizacja {fmtDateTime(quote.updatedAt)}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <WatchlistToggle
              companyId={company.id}
              watchlisted={company.watchlist === 1}
            />
            <RefreshQuotesButton />
            <CompanyModalButton
              company={company}
              label="Edytuj"
              variant="secondary"
              size="sm"
            />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          label="Kurs"
          value={
            quote ? `${fmtNumber(quote.price)} ${company.currency}` : "—"
          }
          sub={quote?.date ? `notowanie z ${fmtDate(quote.date)}` : undefined}
        />
        <StatTile
          label="Dzisiaj"
          value={dayPct !== null ? fmtPct(dayPct) : "—"}
          tone={dayPct === null ? "neutral" : dayPct > 0 ? "pos" : dayPct < 0 ? "neg" : "neutral"}
        />
        {holding ? (
          <>
            <StatTile
              label="Pozycja"
              value={`${fmtQty(holding.shares)} szt.`}
              sub={`śr. koszt ${fmtNumber(holding.avgCost)} ${company.currency}`}
            />
            <StatTile
              label="Wynik pozycji"
              value={
                holding.unrealizedPln !== null
                  ? fmtMoney(holding.unrealizedPln)
                  : "—"
              }
              sub={
                holding.unrealizedPct !== null
                  ? fmtPct(holding.unrealizedPct)
                  : undefined
              }
              tone={
                (holding.unrealizedPln ?? 0) > 0
                  ? "pos"
                  : (holding.unrealizedPln ?? 0) < 0
                    ? "neg"
                    : "neutral"
              }
            />
          </>
        ) : (
          <StatTile
            label="Status"
            value={company.watchlist === 1 ? "Obserwowana" : "Bez pozycji"}
            sub="brak akcji w portfelu"
          />
        )}
      </div>

      <div className="mt-4">
        <Card title={`Kurs ${company.ticker}`}>
          <PriceChart
            data={bars.map((b) => ({ time: b.date, value: b.close }))}
            currency={company.currency}
          />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Card
            title={`Transakcje (${companyTx.length})`}
            actions={
              <TransactionModalButton
                companies={allCompanies}
                defaultCompanyId={company.id}
                label="+ Dodaj"
                size="sm"
                variant="secondary"
              />
            }
          >
            {companyTx.length === 0 ? (
              <EmptyState title="Brak transakcji" />
            ) : (
              <Table
                head={
                  <>
                    <Th>Data</Th>
                    <Th>Typ</Th>
                    <Th right>Ilość</Th>
                    <Th right>Cena</Th>
                    <Th />
                  </>
                }
              >
                {companyTx.map((t) => (
                  <tr key={t.id}>
                    <Td>{fmtDate(t.date)}</Td>
                    <Td>
                      <Badge tone={t.type === "BUY" ? "pos" : "neg"}>
                        {t.type === "BUY" ? "Kupno" : "Sprzedaż"}
                      </Badge>
                    </Td>
                    <Td right>{fmtQty(t.quantity)}</Td>
                    <Td right>{fmtNumber(t.price)}</Td>
                    <Td right>
                      <span className="inline-flex items-center gap-1">
                        <TransactionEditButton
                          companies={allCompanies}
                          transaction={t}
                        />
                        <DeleteButton
                          url={`/api/transactions/${t.id}`}
                          confirmText="Usunąć transakcję?"
                          iconOnly
                        />
                      </span>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card title="Newsy o spółce">
            {news.length === 0 ? (
              <EmptyState
                title="Brak dopasowanych newsów"
                hint={`Newsy są dopasowywane po tickerze "${company.ticker}", nazwie i aliasach. Dodaj aliasy w edycji spółki albo źródło RSS dedykowane tej spółce w Ustawieniach.`}
              />
            ) : (
              <ul className="divide-y divide-border">
                {news.map((n) => (
                  <li key={n.id} className="flex items-start gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`text-[13px] leading-snug hover:text-accent hover:underline ${n.read ? "text-ink2" : "font-medium text-ink"}`}
                      >
                        {n.title}
                      </a>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {n.sourceName}
                        {n.publishedAt && ` · ${fmtDateTime(n.publishedAt)}`}
                      </div>
                    </div>
                    <NewsReadToggle id={n.id} read={n.read} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title={`Notatki (${companyNotes.length})`}
            actions={
              <Link
                href={`/research/new?companyId=${company.id}`}
                className="rounded-lg border border-border2 bg-surface2 px-2.5 py-1 text-[12px] font-medium text-ink hover:border-muted"
              >
                + Nowa notatka
              </Link>
            }
          >
            {companyNotes.length === 0 ? (
              <EmptyState
                title="Brak notatek"
                hint="Twórz notatki researchowe — ręcznie lub z pomocą AI."
              />
            ) : (
              <ul className="divide-y divide-border">
                {companyNotes.map((n) => (
                  <li key={n.id} className="py-2.5">
                    <Link
                      href={`/research/${n.id}`}
                      className="text-[13px] font-medium text-ink hover:text-accent"
                    >
                      {n.title}
                    </Link>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {fmtDateTime(n.updatedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Asystent AI">
            <AiChat companyId={company.id} companyTicker={company.ticker} />
          </Card>
        </div>
      </div>
    </div>
  );
}
