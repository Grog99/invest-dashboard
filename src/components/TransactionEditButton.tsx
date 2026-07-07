"use client";

// Ikonka edycji transakcji w tabeli — otwiera ten sam modal co dodawanie.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Button, Input, Label, Select } from "./ui";
import type { Company, Transaction } from "@/db/schema";

export function TransactionEditButton({
  companies,
  transaction,
}: {
  companies: Company[];
  transaction: Transaction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState(String(transaction.companyId));
  const [type, setType] = useState(transaction.type);
  const [date, setDate] = useState(transaction.date);
  const [quantity, setQuantity] = useState(String(transaction.quantity));
  const [price, setPrice] = useState(String(transaction.price));
  const [commission, setCommission] = useState(String(transaction.commission));
  const [note, setNote] = useState(transaction.note ?? "");

  const currency =
    companies.find((c) => String(c.id) === companyId)?.currency ?? "PLN";

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          date,
          quantity: Number(quantity.replace(",", ".")),
          price: Number(price.replace(",", ".")),
          commission: Number(commission.replace(",", ".")) || 0,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Edytuj transakcję"
        aria-label="Edytuj transakcję"
        className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-muted transition-colors hover:bg-surface2 hover:text-ink"
      >
        ✎
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edytuj transakcję">
        <div className="space-y-3">
          <div>
            <Label>Spółka</Label>
            <Select value={companyId} disabled onChange={() => {}}>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ticker} — {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Typ</Label>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option value="BUY">Kupno</option>
                <option value="SELL">Sprzedaż</option>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Ilość</Label>
              <Input
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <Label>Cena ({currency})</Label>
              <Input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <Label>Prowizja ({currency})</Label>
              <Input
                inputMode="decimal"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Notatka</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
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
