import Link from "next/link";
import { db, companies, notes } from "@/db";
import { desc, eq } from "drizzle-orm";
import { fmtDateTime } from "@/lib/format";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function ResearchPage() {
  const allNotes = db
    .select({
      id: notes.id,
      title: notes.title,
      content: notes.content,
      updatedAt: notes.updatedAt,
      companyId: notes.companyId,
      ticker: companies.ticker,
    })
    .from(notes)
    .leftJoin(companies, eq(companies.id, notes.companyId))
    .orderBy(desc(notes.updatedAt))
    .all();

  return (
    <div>
      <PageHeader
        title="Research"
        sub="Notatki, analizy i wnioski — własne oraz generowane przez AI."
        actions={
          <Link
            href="/research/new"
            className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-accent-ink hover:bg-accent-deep"
          >
            + Nowa notatka
          </Link>
        }
      />

      <Card>
        {allNotes.length === 0 ? (
          <EmptyState
            title="Brak notatek"
            hint="Stwórz pierwszą notatkę researchową — możesz pisać ręcznie w markdown lub wygenerować analizę AI dla wybranej spółki."
            action={
              <Link
                href="/research/new"
                className="rounded-lg bg-accent px-3.5 py-1.5 text-[13px] font-medium text-accent-ink hover:bg-accent-deep"
              >
                + Nowa notatka
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {allNotes.map((n) => {
              const snippet = n.content
                .replace(/[#>*`|\-]/g, " ")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 180);
              return (
                <li key={n.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/research/${n.id}`}
                      className="text-[14px] font-medium text-ink hover:text-accent"
                    >
                      {n.title}
                    </Link>
                    {n.ticker && n.companyId && (
                      <Link href={`/companies/${n.companyId}`}>
                        <Badge tone="accent">{n.ticker}</Badge>
                      </Link>
                    )}
                  </div>
                  {snippet && (
                    <p className="mt-1 text-[12px] leading-relaxed text-muted">
                      {snippet}
                      {n.content.length > 180 ? "…" : ""}
                    </p>
                  )}
                  <div className="mt-1 text-[11px] text-muted">
                    {fmtDateTime(n.updatedAt)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
