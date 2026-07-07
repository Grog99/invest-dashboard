// Klient streamingu czatu AI (SSE z /api/ai/chat) — wspólny dla czatu i edytora.

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
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
