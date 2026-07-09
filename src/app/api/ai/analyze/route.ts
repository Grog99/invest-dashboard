import { NextRequest, NextResponse } from "next/server";
import {
  openrouterChat,
  buildCompanyContext,
  SYSTEM_PROMPT,
  AI_RESEARCH_PROMPT,
  FILL_DRAFT_INSTRUCTION,
  webSearchSystemHint,
} from "@/lib/ai";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const mode = body.mode === "fill" || body.mode === "generate" ? body.mode : null;
  if (!mode) {
    return NextResponse.json(
      { error: "Nieprawidłowy tryb (oczekiwano „fill” lub „generate”)." },
      { status: 400 }
    );
  }

  const companyId = body.companyId ? Number(body.companyId) : null;
  const webSearch = body.webSearch === true;
  const model = typeof body.model === "string" ? body.model : undefined;
  const instructions =
    typeof body.instructions === "string" ? body.instructions.trim() : "";
  const draft = typeof body.draft === "string" ? body.draft : "";

  if (mode === "generate" && !companyId) {
    return NextResponse.json(
      { error: "Tryb „Wygeneruj od zera” wymaga wybranej spółki." },
      { status: 400 }
    );
  }
  if (mode === "fill" && !draft.trim()) {
    return NextResponse.json(
      { error: "Szkic notatki jest pusty — nie ma czego uzupełniać." },
      { status: 400 }
    );
  }

  let system = SYSTEM_PROMPT;
  if (companyId) {
    const context = buildCompanyContext(companyId);
    if (context) {
      system += `\n\n# Kontekst z dashboardu użytkownika\n\n${context}`;
    }
  }
  if (webSearch) {
    system += `\n\n${webSearchSystemHint}`;
  }

  const user =
    mode === "fill"
      ? `${FILL_DRAFT_INSTRUCTION}\n\n${draft}${instructions ? `\n\n${instructions}` : ""}`
      : `${AI_RESEARCH_PROMPT}${instructions ? `\n\n${instructions}` : ""}`;

  try {
    const upstream = await openrouterChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { stream: false, model, webSearch }
    );
    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "AI nie zwróciło treści (możliwy refusal lub błąd modelu)." },
        { status: 502 }
      );
    }
    return NextResponse.json({ content });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
