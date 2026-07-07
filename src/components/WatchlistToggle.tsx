"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WatchlistToggle({
  companyId,
  watchlisted,
}: {
  companyId: number;
  watchlisted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watchlist: !watchlisted }),
    });
    router.refresh();
    setBusy(false);
  };

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={watchlisted ? "Usuń z watchlisty" : "Dodaj do watchlisty"}
      className={`cursor-pointer rounded-md px-1.5 py-0.5 text-[14px] transition-colors disabled:opacity-50 ${
        watchlisted ? "text-warn hover:text-muted" : "text-muted hover:text-warn"
      }`}
    >
      {watchlisted ? "★" : "☆"}
    </button>
  );
}
