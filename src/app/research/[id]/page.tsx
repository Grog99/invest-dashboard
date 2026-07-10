import { notFound } from "next/navigation";
import { db, companies, notes } from "@/db";
import { asc, eq } from "drizzle-orm";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Card } from "@/components/ui";
import { NoteEditor } from "@/components/NoteEditor";
import { DeleteButton } from "@/components/DeleteButton";
import { getAiConfig } from "@/lib/ai";

export const dynamic = "force-dynamic";

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = db.select().from(notes).where(eq(notes.id, Number(id))).get();
  if (!note) notFound();

  const allCompanies = db
    .select()
    .from(companies)
    .orderBy(asc(companies.ticker))
    .all();
  const {
    model: defaultModel,
    temperature,
    topP,
    reasoningEffort,
  } = getAiConfig();

  return (
    <div>
      <PageHeader
        title={note.title}
        sub={`utworzona ${fmtDateTime(note.createdAt)} · edytowana ${fmtDateTime(note.updatedAt)}`}
        actions={
          <DeleteButton
            url={`/api/notes/${note.id}`}
            confirmText={`Usunąć notatkę "${note.title}"?`}
            redirectTo="/research"
            label="Usuń notatkę"
          />
        }
      />
      <Card>
        <NoteEditor
          note={note}
          companies={allCompanies}
          defaultModel={defaultModel}
          defaultTemperature={temperature != null ? String(temperature) : ""}
          defaultTopP={topP != null ? String(topP) : ""}
          defaultReasoningEffort={reasoningEffort ?? ""}
        />
      </Card>
    </div>
  );
}
