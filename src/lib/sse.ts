// Klient streamingu czatu AI (SSE z /api/ai/chat) — wspólny dla czatu i edytora.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Rozliczenie kosztu/tokenów z ostatniego chunku SSE analizy (OpenRouter
// `usage: { include: true }`). Wszystkie pola opcjonalne — provider może ich
// nie zwrócić.
export interface AnalyzeUsage {
  cost?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  costDetails?: Record<string, unknown>;
}

// Streaming klienta dla „Analiza AI" (SSE z /api/ai/analyze). Akumuluje treść
// (delta.content) i wyciąga `usage` z finalnego chunku. Streaming zamiast
// buforowania całej odpowiedzi — dzięki temu reverse proxy nie zrywa długiej
// analizy błędem 504 (dawny non-streaming /api/ai/analyze zwracał na produkcji
// stronę HTML 504 → „Unexpected token '<'" po stronie klienta).
export async function streamAnalyze(
  body: Record<string, unknown>,
  onDelta?: (text: string) => void,
  signal?: AbortSignal
): Promise<{ content: string; usage: AnalyzeUsage }> {
  const res = await fetch("/api/ai/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error("Brak strumienia odpowiedzi.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: AnalyzeUsage = {};

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(":")) continue; // komentarze keep-alive
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return { content, usage };
      try {
        const json = JSON.parse(payload);
        const err = json?.error?.message;
        if (err) throw new Error(err);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          content += delta;
          onDelta?.(delta);
        }
        const u = json?.usage;
        if (u) {
          usage = {
            cost: u.cost,
            totalTokens: u.total_tokens,
            promptTokens: u.prompt_tokens,
            completionTokens: u.completion_tokens,
            reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
            costDetails: u.cost_details,
          };
        }
      } catch (e) {
        if (e instanceof SyntaxError) continue; // niepełny JSON — pomijamy
        throw e;
      }
    }
  }

  return { content, usage };
}

export async function streamChat(
  body: { messages: ChatTurn[]; companyId?: number | null },
  onDelta: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error("Brak strumienia odpowiedzi.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(":")) continue; // komentarze keep-alive
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) onDelta(delta);
        const err = json?.error?.message;
        if (err) throw new Error(err);
      } catch (e) {
        if (e instanceof SyntaxError) continue; // niepełny JSON — pomijamy
        throw e;
      }
    }
  }
}
