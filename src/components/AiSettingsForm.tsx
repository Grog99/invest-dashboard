"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "./ui";

export function AiSettingsForm({
  model,
  hasApiKey,
  apiKeyPreview,
}: {
  model: string;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [modelValue, setModelValue] = useState(model);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const payload: Record<string, string> = { model: modelValue };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMessage("Zapisano ustawienia.");
      setApiKey("");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-3">
      <div>
        <Label htmlFor="ai-key">Klucz API OpenRouter</Label>
        <Input
          id="ai-key"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            hasApiKey
              ? `zapisany: ${apiKeyPreview} — wpisz nowy, aby podmienić`
              : "sk-or-…"
          }
        />
        <p className="mt-1 text-[11px] text-muted">
          Klucz znajdziesz na{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            openrouter.ai/keys
          </a>
          . Przechowywany wyłącznie lokalnie, w pliku bazy na Twoim dysku.
        </p>
      </div>
      <div>
        <Label htmlFor="ai-model">Model</Label>
        <Input
          id="ai-model"
          value={modelValue}
          onChange={(e) => setModelValue(e.target.value)}
          placeholder="anthropic/claude-sonnet-4.5"
        />
        <p className="mt-1 text-[11px] text-muted">
          Identyfikator modelu z{" "}
          <a
            href="https://openrouter.ai/models"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            openrouter.ai/models
          </a>
          , np. anthropic/claude-sonnet-4.5, openai/gpt-4o, google/gemini-2.5-pro.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "Zapisuję…" : "Zapisz"}
        </Button>
        {message && <span className="text-[12px] text-muted">{message}</span>}
      </div>
    </div>
  );
}
