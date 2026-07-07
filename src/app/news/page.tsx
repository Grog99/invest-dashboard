import { db, companies } from "@/db";
import { asc } from "drizzle-orm";
import { listNews, encodeCursor } from "@/lib/news";
import { Card, PageHeader, EmptyState } from "@/components/ui";
import { RefreshNewsButton } from "@/components/RefreshButtons";
import { MarkAllReadButton } from "@/components/NewsActions";
import { NewsFilter } from "@/components/NewsFilter";
import { NewsInfiniteList } from "@/components/NewsInfiniteList";

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
  const news = listNews({ companyId, unreadOnly, limit: 50 });
  const initialCursor =
    news.length === 50 ? encodeCursor(news[news.length - 1]) : null;
  // Czysta funkcja świeżo pobranych danych (bez Date.now()/Math.random() —
  // React Compiler / react-hooks/purity tego zabrania w ciele komponentu):
  // zmienia się, gdy zmieni się filtr LUB skład/stan `read` pierwszej porcji
  // — czyli po "Oznacz wszystkie jako przeczytane" i po "Pobierz newsy"
  // (oba wołają router.refresh()). Wymusza pełny remount NewsInfiniteList ze
  // świeżą pierwszą porcją zamiast prób synchronizowania stanu klienckiego
  // z propsami po fakcie (patrz komentarz w NewsInfiniteList.tsx).
  const listKey = `${companyId ?? "all"}-${unreadOnly ? 1 : 0}-${news
    .map((n) => `${n.id}:${n.read ? 1 : 0}`)
    .join(",")}`;

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
          <NewsInfiniteList
            key={listKey}
            initialItems={news}
            initialCursor={initialCursor}
            companyId={companyId}
            unreadOnly={unreadOnly}
          />
        )}
      </Card>
    </div>
  );
}
