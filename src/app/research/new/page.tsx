import { db, companies } from "@/db";
import { asc } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui";
import { NoteEditor } from "@/components/NoteEditor";

export const dynamic = "force-dynamic";

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const sp = await searchParams;
  const allCompanies = db
    .select()
    .from(companies)
    .orderBy(asc(companies.ticker))
    .all();

  return (
    <div>
      <PageHeader title="Nowa notatka" />
      <Card>
        <NoteEditor
          companies={allCompanies}
          defaultCompanyId={sp.companyId ? Number(sp.companyId) : undefined}
        />
      </Card>
    </div>
  );
}
