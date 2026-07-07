"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteButton({
  url,
  confirmText,
  redirectTo,
  label = "Usuń",
  iconOnly = false,
}: {
  url: string;
  confirmText: string;
  redirectTo?: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!confirm(confirmText)) return;
    setBusy(true);
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (iconOnly) {
    return (
      <button
        onClick={run}
        disabled={busy}
        title={label}
        aria-label={label}
        className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-muted transition-colors hover:bg-neg/10 hover:text-neg disabled:opacity-50"
      >
        ✕
      </button>
    );
  }
  return (
    <button
      onClick={run}
      disabled={busy}
      className="cursor-pointer rounded-lg border border-neg/40 px-2.5 py-1 text-[12px] font-medium text-neg transition-colors hover:bg-neg/10 disabled:opacity-50"
    >
      {busy ? "Usuwam…" : label}
    </button>
  );
}
