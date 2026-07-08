"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

export function BenchmarkSelect({
  options,
  selectedId,
}: {
  options: { id: number; label: string }[];
  selectedId: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onChange = async (e: ChangeEvent<HTMLSelectElement>) => {
    setBusy(true);
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ benchmarkCompanyId: e.target.value }),
    });
    router.refresh();
    setBusy(false);
  };

  return (
    <Select
      value={selectedId ?? ""}
      onChange={onChange}
      disabled={busy}
      className="w-auto"
    >
      <option value="">Benchmark: brak</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
