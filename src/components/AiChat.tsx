"use client";

// Panel czatu AI (OpenRouter) — streaming, kontekst spółki, zapis do notatki.

import { useRef, useState } from "react";
import { Button, Textarea } from "./ui";
import { Markdown } from "./Markdown";
import { streamChat, type ChatTurn } from "@/lib/sse";

export function AiChat({
  companyId,
  companyTicker,
}: {
  companyId?: number;
  companyTicker?: string;
}) {
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    const question = input.trim();
    if (!question || busy) return;
    setError(null);
    setSaved(false);
    setInput("");
    setBusy(true);

    const history: ChatTurn[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      await streamChat({ messages: history, companyId }, (delta) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = {
            ...last,
            content: last.content + delta,
          };
          return next;
        });
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages(history); // usuń pustą odpowiedź
    } finally {
      setBusy(false);
    }
  };

  const saveAsNote = async () => {
    const lastAnswer = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAnswer?.content) return;
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `Analiza AI${companyTicker ? ` — ${companyTicker}` : ""} (${new Date().toLocaleDateString("pl-PL")})`,
        content: lastAnswer.content,
        companyId: companyId ?? null,
      }),
    });
    if (res.ok) setSaved(true);
  };

  return (
    <div className="flex flex-col gap-3">
      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-border bg-bg/40 p-3"
        >
          {messages.map((m, i) => (
            <div key={i}>
              {m.role === "user" ? (
                <div className="ml-8 rounded-lg bg-accent-deep/25 px-3 py-2 text-[13px] text-ink">
                  {m.content}
                </div>
              ) : (
                <div className="mr-2">
                  {m.content ? (
                    <Markdown embedCharts={!busy}>{m.content}</Markdown>
                  ) : (
                    <span className="text-[13px] text-muted">Myślę…</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {error && (
        <p className="rounded-lg border border-neg/40 bg-neg/10 px-3 py-2 text-[12px] text-neg">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            companyTicker
              ? `Zapytaj o ${companyTicker} — AI zna notowania, newsy i Twoje notatki…`
              : "Zapytaj o spółkę, rynek, strategię…"
          }
        />
        <Button variant="primary" onClick={send} disabled={busy || !input.trim()}>
          {busy ? "…" : "Wyślij"}
        </Button>
      </div>
      {messages.some((m) => m.role === "assistant" && m.content) && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setMessages([])}>
            Wyczyść rozmowę
          </Button>
          <Button size="sm" variant="secondary" onClick={saveAsNote}>
            {saved ? "✓ Zapisano jako notatkę" : "Zapisz odpowiedź jako notatkę"}
          </Button>
        </div>
      )}
    </div>
  );
}
