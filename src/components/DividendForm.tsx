"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Button, Input, Label, Select } from "./ui";
import type { Company } from "@/db/schema";

export function DividendModalButton({
  companies,
  defaultCompanyId,
  label,
  variant = "secondary",
  size = "md",
}: {
  companies: Company[];
  defaultCompanyId?: number;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [companyId, setCompanyId] = useState(
    String(defaultCompanyId ?? companies[0]?.id ?? "")
  );
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [taxWithheld, setTaxWithheld] = useState("0");
  const [note, setNote] = useState("");

  const currency =
    companies.find((c) => String(c.id) === companyId)?.currency ?? "PLN";

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: Number(companyId),
          date,
          amount: Number(amount.replace(",", ".")),
          taxWithheld: Number(taxWithheld.replace(",", ".")) || 0,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setOpen(false);
      setAmount("");
      setNote("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Dodaj dywidendę">
        <div className="space-y-3">
          <div>
            <Label htmlFor="df-company">Spółka</Label>
            <Select
              id="df-company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ticker} — {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="df-date">Data wypłaty</Label>
              <Input
                id="df-date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="df-amount">Kwota brutto ({currency})</Label>
              <Input
                id="df-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="łącznie"
              />
            </div>
            <div>
              <Label htmlFor="df-tax">Podatek pobrany ({currency})</Label>
              <Input
                id="df-tax"
                inputMode="decimal"
                value={taxWithheld}
                onChange={(e) => setTaxWithheld(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="df-note">Notatka (opcjonalnie)</Label>
            <Input
              id="df-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && <p className="text-[12px] text-neg">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Zapisuję…" : "Zapisz"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
