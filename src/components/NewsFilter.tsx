"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Select } from "./ui";
import type { Company } from "@/db/schema";

export function NewsFilter({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const company = params.get("company") ?? "";
  const unread = params.get("unread") === "1";

  const navigate = (nextCompany: string, nextUnread: boolean) => {
    const q = new URLSearchParams();
    if (nextCompany) q.set("company", nextCompany);
    if (nextUnread) q.set("unread", "1");
    router.push(`/news${q.toString() ? `?${q}` : ""}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={company}
        onChange={(e) => navigate(e.target.value, unread)}
        className="w-56"
      >
        <option value="">Wszystkie spółki</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.ticker} — {c.name}
          </option>
        ))}
      </Select>
      <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink2">
        <input
          type="checkbox"
          checked={unread}
          onChange={(e) => navigate(company, e.target.checked)}
          className="accent-accent"
        />
        tylko nieprzeczytane
      </label>
    </div>
  );
}
