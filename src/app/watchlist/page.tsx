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
  Field,
} from "@/components/ui";
import { RefreshQuotesButton } from "@/components/RefreshButtons";
import { CompanyModalButton } from "@/components/CompanyForm";
import { WatchlistToggle } from "@/components/WatchlistToggle";
import { CompanyLogo } from "@/components/CompanyLogo";
import { getLogoFlags } from "@/lib/logos";

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
  const logoFlags = getLogoFlags(watched.map((c) => c.id));
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
          <>
            <div className="hidden md:block">
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
                        <span className="inline-flex items-center gap-2">
                          <CompanyLogo
                            ticker={c.ticker}
                            name={c.name}
                            companyId={c.id}
                            hasLogo={logoFlags.get(c.id) ?? false}
                            color={c.color}
                          />
                          <span>
                            <Link
                              href={`/companies/${c.id}`}
                              className="font-medium text-ink hover:text-accent"
                            >
                              {c.ticker}
                            </Link>
                            <span className="ml-2 hidden text-[12px] text-muted lg:inline">
                              {c.name}
                            </span>
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <Badge>{c.market}</Badge>
                      </Td>
                      <Td>
                        <Badge tone="accent">
                          {TYPE_LABELS[c.type] ?? c.type}
                        </Badge>
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
            </div>
            <div className="space-y-2 md:hidden">
              {watched.map((c) => {
                const q = quotes.get(c.id);
                const dayPct =
                  q?.price !== undefined && q?.prevClose
                    ? ((q.price - q.prevClose) / q.prevClose) * 100
                    : null;
                const unread = unreadCounts.get(c.id) ?? 0;
                return (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border bg-surface p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <WatchlistToggle companyId={c.id} watchlisted />
                        <CompanyLogo
                          ticker={c.ticker}
                          name={c.name}
                          companyId={c.id}
                          hasLogo={logoFlags.get(c.id) ?? false}
                          color={c.color}
                        />
                        <div>
                          <Link
                            href={`/companies/${c.id}`}
                            className="font-medium text-ink hover:text-accent"
                          >
                            {c.ticker}
                          </Link>
                          <div className="text-[12px] text-muted">
                            {c.name}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] text-muted">Dziś</div>
                        <Delta pct={dayPct} />
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge>{c.market}</Badge>
                      <Badge tone="accent">{TYPE_LABELS[c.type] ?? c.type}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <Field label="Kurs">
                        {q ? (
                          <>
                            {fmtNumber(q.price)}{" "}
                            <span className="text-muted">{c.currency}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </Field>
                      <Field label="Nieprzeczytane newsy">
                        {unread > 0 ? (
                          <Link href={`/companies/${c.id}`}>
                            <Badge tone="accent">{unread}</Badge>
                          </Link>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </Field>
                      <Field label="Aktualizacja">
                        {q ? fmtDateTime(q.updatedAt) : "—"}
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
