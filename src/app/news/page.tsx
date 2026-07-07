import Link from "next/link";
import { db, companies } from "@/db";
import { asc } from "drizzle-orm";
import { listNews } from "@/lib/news";
import { fmtDateTime } from "@/lib/format";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { RefreshNewsButton } from "@/components/RefreshButtons";
import { NewsReadToggle, MarkAllReadButton } from "@/components/NewsActions";
import { NewsFilter } from "@/components/NewsFilter";

export const dynamic = "force-dynamic";

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; unread?: string }>;
}) {
  const sp = await searchParams;
  const companyId = sp.company ? Number(sp.company) : undefined;
  const unreadOnly = sp.unread === "1";

  const allCompanies = db
    .select()
    .from(companies)
    .orderBy(asc(companies.ticker))
    .all();
  const news = listNews({ companyId, unreadOnly, limit: 150 });

  return (
    <div>
      <PageHeader
        title="Newsy"
        sub="Wpisy z kanałów RSS dopasowane do Twoich spółek. Źródła skonfigurujesz w Ustawieniach."
        actions={
          <>
            <MarkAllReadButton />
            <RefreshNewsButton />
          </>
        }
      />

      <div className="mb-4">
        <NewsFilter companies={allCompanies} />
      </div>

      <Card>
        {news.length === 0 ? (
          <EmptyState
            title="Brak newsów"
            hint='Kliknij "Pobierz newsy" — przy pierwszym uruchomieniu domyślne źródła (ESPI, Bankier, Strefa Inwestorów) dodadzą się automatycznie.'
            action={<RefreshNewsButton />}
          />
        ) : (
          <ul className="divide-y divide-border">
            {news.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <a
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-[13.5px] leading-snug hover:text-accent hover:underline ${n.read ? "text-ink2" : "font-medium text-ink"}`}
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
                    {n.companies.map((c) => (
                      <Link key={c.id} href={`/companies/${c.id}`}>
                        <Badge tone="accent">{c.ticker}</Badge>
                      </Link>
                    ))}
                  </div>
                </div>
                <NewsReadToggle id={n.id} read={n.read} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
