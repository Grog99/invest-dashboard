"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

export function NewsReadToggle({ id, read }: { id: number; read: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await fetch("/api/news", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: !read }),
    });
    router.refresh();
    setBusy(false);
  };
  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={read ? "Oznacz jako nieprzeczytane" : "Oznacz jako przeczytane"}
      className={`cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] transition-colors ${
        read ? "text-muted hover:text-ink2" : "text-accent hover:text-ink"
      }`}
    >
      {read ? "↺" : "✓"}
    </button>
  );
}

export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await fetch("/api/news", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allRead: true }),
    });
    router.refresh();
    setBusy(false);
  };
  return (
    <Button size="sm" variant="ghost" onClick={run} disabled={busy}>
      Oznacz wszystkie jako przeczytane
    </Button>
  );
}
