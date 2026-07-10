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
  isValidMaxResults,
} from "@/lib/settings";

export const maxDuration = 300;

// Proxyuje strumień SSE z OpenRoutera do klienta, wstrzykując co ~15 s komentarz
// keep-alive (": ping"). Bez tego reverse proxy przed kontenerem (nginx
// proxy_read_timeout, Cloudflare ~100 s itp.) zrywa połączenie błędem 504
// podczas ciszy zanim polecą pierwsze tokeny (faza web searchu / rozgrzewki
// reasoningu). Klient ignoruje linie zaczynające się od ":" (patrz sse.ts).
function sseWithHeartbeat(
  upstream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // strumień już zamknięty — ignorujemy
        }
      }, 15000);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      } finally {
        clearInterval(heartbeat);
      }
    },
    cancel(reason) {
      reader.cancel(reason);
    },
  });
}

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
  const maxResults =
    typeof body.maxResults === "number" && Number.isFinite(body.maxResults)
      ? body.maxResults
      : undefined;
  if (maxResults !== undefined && !isValidMaxResults(maxResults)) {
    return NextResponse.json(
      { error: "Liczba wyników web searchu musi być jedną z: 3, 5, 10, 15, 20." },
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

  // Streaming (nie non-streaming): pełna analiza z web searchem + reasoningiem
  // potrafi trwać minuty. Przy buforowaniu całości po stronie serwera reverse
  // proxy nie widzi żadnych bajtów i zrywa połączenie błędem 504 (klient
  // dostawał wtedy stronę HTML błędu → „Unexpected token '<'"). Strumieniujemy
  // SSE token po tokenie (jak /api/ai/chat) — połączenie żyje. `includeUsage`
  // dosyła koszt/tokeny w ostatnim chunku; klient wyciąga je z SSE (patrz
  // streamAnalyze w src/lib/sse.ts).
  try {
    const upstream = await openrouterChat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        stream: true,
        includeUsage: true,
        model,
        webSearch,
        temperature,
        topP,
        reasoning: reasoningEffort,
        maxResults,
      }
    );
    if (!upstream.body) {
      return NextResponse.json(
        { error: "Brak strumienia odpowiedzi z OpenRoutera." },
        { status: 502 }
      );
    }
    return new Response(sseWithHeartbeat(upstream.body), {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        // Wyłącza buforowanie odpowiedzi przez nginx/reverse proxy — bez tego
        // SSE może być buforowane i keep-alive nie dociera na czas.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
