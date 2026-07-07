import { NextRequest, NextResponse } from "next/server";
import {
  openrouterChat,
  buildCompanyContext,
  SYSTEM_PROMPT,
  type ChatMessage,
} from "@/lib/ai";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const messages = (Array.isArray(body.messages) ? body.messages : []).filter(
    (m: ChatMessage) =>
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
  ) as ChatMessage[];

  if (messages.length === 0) {
    return NextResponse.json({ error: "Brak wiadomości." }, { status: 400 });
  }

  let system = SYSTEM_PROMPT;
  const companyId = body.companyId ? Number(body.companyId) : null;
  if (companyId) {
    const context = buildCompanyContext(companyId);
    if (context) {
      system += `\n\n# Kontekst z dashboardu użytkownika\n\n${context}`;
    }
  }

  try {
    const upstream = await openrouterChat(
      [{ role: "system", content: system }, ...messages],
      { stream: true }
    );
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
