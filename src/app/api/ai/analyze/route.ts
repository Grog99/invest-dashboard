import { NextRequest, NextResponse } from "next/server";
import {
  openrouterChat,
  buildCompanyContext,
  SYSTEM_PROMPT,
  AI_RESEARCH_PROMPT,
  FILL_DRAFT_INSTRUCTION,
  webSearchSystemHint,
} from "@/lib/ai";
import {
  isValidTemperature,
  isValidTopP,
  isValidReasoningEffort,
} from "@/lib/settings";

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

  // Override generowania per uruchomienie: puste/nieobecne -> undefined ->
  // openrouterChat sam sięgnie po domyślną z Ustawień (getAiConfig). Zakresy
  // walidowane tu (400 z czytelnym komunikatem), spójnie z /api/settings.
  const temperature =
    typeof body.temperature === "number" && Number.isFinite(body.temperature)
      ? body.temperature
      : undefined;
  if (temperature !== undefined && !isValidTemperature(temperature)) {
    return NextResponse.json(
      { error: "Temperature musi być w zakresie 0–2." },
      { status: 400 }
    );
  }
  const topP =
    typeof body.topP === "number" && Number.isFinite(body.topP)
      ? body.topP
      : undefined;
  if (topP !== undefined && !isValidTopP(topP)) {
    return NextResponse.json(
      { error: "Top P musi być w zakresie 0–1." },
      { status: 400 }
    );
  }
  const reasoningEffort =
    typeof body.reasoningEffort === "string" && body.reasoningEffort
      ? body.reasoningEffort
      : undefined;
  if (reasoningEffort !== undefined && !isValidReasoningEffort(reasoningEffort)) {
    return NextResponse.json(
      { error: "Reasoning effort musi być jednym z: low, medium, high." },
      { status: 400 }
    );
  }

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
      { stream: false, model, webSearch, temperature, topP, reasoning: reasoningEffort }
    );
    const data = await upstream.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json(
        { error: "AI nie zwróciło treści (możliwy refusal lub błąd modelu)." },
        { status: 502 }
      );
    }
    // Usage accounting OpenRoutera — zawsze automatycznie dołączane do
    // odpowiedzi non-streaming (patrz plan, Podejście pkt 3). Wszystkie pola
    // opcjonalne (mogą być undefined/0/null w zależności od providera).
    const usage = {
      cost: data?.usage?.cost,
      totalTokens: data?.usage?.total_tokens,
      promptTokens: data?.usage?.prompt_tokens,
      completionTokens: data?.usage?.completion_tokens,
      reasoningTokens: data?.usage?.completion_tokens_details?.reasoning_tokens,
      costDetails: data?.usage?.cost_details,
    };
    return NextResponse.json({ content, usage });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
