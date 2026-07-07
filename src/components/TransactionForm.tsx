"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Button, Input, Label, Select } from "./ui";
import type { Company, Transaction } from "@/db/schema";

export function TransactionModalButton({
  companies,
  defaultCompanyId,
  transaction,
  label,
  variant = "primary",
  size = "md",
}: {
  companies: Company[];
  defaultCompanyId?: number;
  transaction?: Transaction;
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
    String(transaction?.companyId ?? defaultCompanyId ?? companies[0]?.id ?? "")
  );
  const [type, setType] = useState(transaction?.type ?? "BUY");
  const [date, setDate] = useState(transaction?.date ?? today);
  const [quantity, setQuantity] = useState(
    transaction ? String(transaction.quantity) : ""
  );
  const [price, setPrice] = useState(
    transaction ? String(transaction.price) : ""
  );
  const [commission, setCommission] = useState(
    transaction ? String(transaction.commission) : "0"
  );
  const [note, setNote] = useState(transaction?.note ?? "");

  const currency =
    companies.find((c) => String(c.id) === companyId)?.currency ?? "PLN";

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        companyId: Number(companyId),
        type,
        date,
        quantity: Number(quantity.replace(",", ".")),
        price: Number(price.replace(",", ".")),
        commission: Number(commission.replace(",", ".")) || 0,
        note,
      };
      const res = await fetch(
        transaction ? `/api/transactions/${transaction.id}` : "/api/transactions",
        {
          method: transaction ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setOpen(false);
      if (!transaction) {
        setQuantity("");
        setPrice("");
        setNote("");
      }
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
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={transaction ? "Edytuj transakcję" : "Dodaj transakcję"}
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="tf-company">Spółka</Label>
            <Select
              id="tf-company"
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tf-type">Typ</Label>
              <Select
                id="tf-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="BUY">Kupno</option>
                <option value="SELL">Sprzedaż</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="tf-date">Data</Label>
              <Input
                id="tf-date"
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="tf-qty">Ilość</Label>
              <Input
                id="tf-qty"
                inputMode="decimal"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="np. 100"
              />
            </div>
            <div>
              <Label htmlFor="tf-price">Cena ({currency})</Label>
              <Input
                id="tf-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="za akcję"
              />
            </div>
            <div>
              <Label htmlFor="tf-comm">Prowizja ({currency})</Label>
              <Input
                id="tf-comm"
                inputMode="decimal"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="tf-note">Notatka (opcjonalnie)</Label>
            <Input
              id="tf-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="np. broker, powód zakupu"
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
