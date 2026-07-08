import Link from "next/link";
import { db, companies, quotesLatest, newsCompany, newsItems } from "@/db";
import { asc, eq, sql } from "drizzle-orm";
import { fmtNumber, fmtDateTime } from "@/lib/format";
import {
  Card,
  PageHeader,
  Table,
  Th,
  Td,
  Delta,
  Badge,
  EmptyState,
} from "@/components/ui";
import { RefreshQuotesButton } from "@/components/RefreshButtons";
import { CompanyModalButton } from "@/components/CompanyForm";
import { WatchlistToggle } from "@/components/WatchlistToggle";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  STOCK: "Akcje",
  ETF: "ETF",
  INDEX: "Indeks",
};

export default function WatchlistPage() {
  const watched = db
    .select()
    .from(companies)
    .where(eq(companies.watchlist, 1))
    .orderBy(asc(companies.ticker))
    .all();
  const quotes = new Map(
    db.select().from(quotesLatest).all().map((q) => [q.companyId, q])
  );
  const unreadCounts = new Map(
    db
      .select({
        companyId: newsCompany.companyId,
        count: sql<number>`count(*)`,
      })
      .from(newsCompany)
      .innerJoin(newsItems, eq(newsItems.id, newsCompany.newsId))
      .where(eq(newsItems.read, 0))
      .groupBy(newsCompany.companyId)
      .all()
      .map((r) => [r.companyId, r.count])
  );

  return (
    <div>
      <PageHeader
        title="Watchlista"
        sub="Spółki, które obserwujesz — również te, których nie masz w portfelu."
        actions={
          <>
            <RefreshQuotesButton />
            <CompanyModalButton
              label="+ Dodaj spółkę"
              defaultWatchlist
              size="sm"
            />
          </>
        }
      />

      <Card>
        {watched.length === 0 ? (
          <EmptyState
            title="Watchlista jest pusta"
            hint="Dodaj spółki, które chcesz obserwować — notowania i newsy będą zbierane tak samo jak dla portfela."
            action={
              <CompanyModalButton label="+ Dodaj spółkę" defaultWatchlist />
            }
          />
        ) : (
          <Table
            head={
              <>
                <Th />
                <Th>Spółka</Th>
                <Th>Rynek</Th>
                <Th>Typ</Th>
                <Th right>Kurs</Th>
                <Th right>Dziś</Th>
                <Th right>Nieprzeczytane newsy</Th>
                <Th right>Aktualizacja</Th>
              </>
            }
          >
            {watched.map((c) => {
              const q = quotes.get(c.id);
              const dayPct =
                q?.price !== undefined && q?.prevClose
                  ? ((q.price - q.prevClose) / q.prevClose) * 100
                  : null;
              const unread = unreadCounts.get(c.id) ?? 0;
              return (
                <tr key={c.id} className="hover:bg-surface2/40">
                  <Td className="w-8">
                    <WatchlistToggle companyId={c.id} watchlisted />
                  </Td>
                  <Td>
                    <Link
                      href={`/companies/${c.id}`}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {c.ticker}
                    </Link>
                    <span className="ml-2 hidden text-[12px] text-muted lg:inline">
                      {c.name}
                    </span>
                  </Td>
                  <Td>
                    <Badge>{c.market}</Badge>
                  </Td>
                  <Td>
                    <Badge tone="accent">{TYPE_LABELS[c.type] ?? c.type}</Badge>
                  </Td>
                  <Td right>
                    {q ? (
                      <>
                        {fmtNumber(q.price)}{" "}
                        <span className="text-muted">{c.currency}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td right>
                    <Delta pct={dayPct} />
                  </Td>
                  <Td right>
                    {unread > 0 ? (
                      <Link href={`/companies/${c.id}`}>
                        <Badge tone="accent">{unread}</Badge>
                      </Link>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                  </Td>
                  <Td right>
                    <span className="text-[11px] text-muted">
                      {q ? fmtDateTime(q.updatedAt) : "—"}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
