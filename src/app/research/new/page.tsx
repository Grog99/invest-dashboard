import { db, companies, noteTemplates } from "@/db";
import { asc } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui";
import { NoteEditor } from "@/components/NoteEditor";
import { buildTemplateOptions } from "@/lib/templates";
import { getAiConfig } from "@/lib/ai";

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
  const userTemplates = db
    .select()
    .from(noteTemplates)
    .orderBy(asc(noteTemplates.name))
    .all();
  const templateOptions = buildTemplateOptions(userTemplates);
  const { model: defaultModel } = getAiConfig();

  return (
    <div>
      <PageHeader title="Nowa notatka" />
      <Card>
        <NoteEditor
          companies={allCompanies}
          defaultCompanyId={sp.companyId ? Number(sp.companyId) : undefined}
          templates={templateOptions}
          defaultModel={defaultModel}
        />
      </Card>
    </div>
  );
}
