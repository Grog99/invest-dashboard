"use client";

// Modal dodawania/edycji pozycji CFD — wzorzec 1:1 z TransactionForm.tsx.
// Symbol (krótka etykieta) jest liczony po stronie API z quoteSymbol, więc
// formularz go nie pyta — patrz src/app/api/cfd/route.ts.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Button, Input, Label, Select } from "./ui";
import type { CfdPosition } from "@/db/schema";

export function CfdModalButton({
  position,
  label,
  variant = "primary",
  size = "md",
  iconOnly = false,
}: {
  position?: CfdPosition;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(position?.name ?? "CFD WIG20");
  const [direction, setDirection] = useState(position?.direction ?? "LONG");
  const [volume, setVolume] = useState(position ? String(position.volume) : "1");
  const [openPrice, setOpenPrice] = useState(
    position ? String(position.openPrice) : ""
  );
  const [pointValue, setPointValue] = useState(
    position ? String(position.pointValue) : "20"
  );
  const [quoteSymbol, setQuoteSymbol] = useState(
    position?.quoteSymbol ?? "WIG20.WA"
  );
  const [openedAt, setOpenedAt] = useState(position?.openedAt ?? today);
  const [overridePrice, setOverridePrice] = useState(
    position?.overridePrice !== null && position?.overridePrice !== undefined
      ? String(position.overridePrice)
      : ""
  );
  const [overridePnl, setOverridePnl] = useState(
    position?.overridePnl !== null && position?.overridePnl !== undefined
      ? String(position.overridePnl)
      : ""
  );
  const [swapPln, setSwapPln] = useState(
    position?.swapPln !== null && position?.swapPln !== undefined
      ? String(position.swapPln)
      : ""
  );
  const [note, setNote] = useState(position?.note ?? "");

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name,
        direction,
        volume: Number(volume.replace(",", ".")),
        openPrice: Number(openPrice.replace(",", ".")),
        pointValue: Number(pointValue.replace(",", ".")),
        quoteSymbol: quoteSymbol.trim().toUpperCase(),
        openedAt,
        overridePrice:
          overridePrice.trim() === ""
            ? null
            : Number(overridePrice.replace(",", ".")),
        overridePnl:
          overridePnl.trim() === "" ? null : Number(overridePnl.replace(",", ".")),
        swapPln: swapPln.trim() === "" ? null : Number(swapPln.replace(",", ".")),
        note,
      };
      const res = await fetch(position ? `/api/cfd/${position.id}` : "/api/cfd", {
        method: position ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      setOpen(false);
      if (!position) {
        setVolume("1");
        setOpenPrice("");
        setOverridePrice("");
        setOverridePnl("");
        setSwapPln("");
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
      {iconOnly ? (
        <button
          onClick={() => setOpen(true)}
          title="Edytuj pozycję CFD"
          aria-label="Edytuj pozycję CFD"
          className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-muted transition-colors hover:bg-surface2 hover:text-ink"
        >
          ✎
        </button>
      ) : (
        <Button variant={variant} size={size} onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={position ? "Edytuj pozycję CFD" : "Dodaj pozycję CFD"}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cf-name">Nazwa</Label>
              <Input
                id="cf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cf-direction">Kierunek</Label>
              <Select
                id="cf-direction"
                value={direction}
                onChange={(e) => setDirection(e.target.value)}
              >
                <option value="LONG">LONG</option>
                <option value="SHORT">SHORT</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="cf-volume">Wolumen (loty)</Label>
              <Input
                id="cf-volume"
                inputMode="decimal"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                placeholder="np. 1"
              />
            </div>
            <div>
              <Label htmlFor="cf-open-price">Cena otwarcia (pkt)</Label>
              <Input
                id="cf-open-price"
                inputMode="decimal"
                value={openPrice}
                onChange={(e) => setOpenPrice(e.target.value)}
                placeholder="np. 2400"
              />
            </div>
            <div>
              <Label htmlFor="cf-point-value">Wart. punktu (PLN/pkt)</Label>
              <Input
                id="cf-point-value"
                inputMode="decimal"
                value={pointValue}
                onChange={(e) => setPointValue(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cf-quote-symbol">Symbol notowań (Yahoo)</Label>
              <Input
                id="cf-quote-symbol"
                value={quoteSymbol}
                onChange={(e) => setQuoteSymbol(e.target.value)}
                placeholder="WIG20.WA"
              />
            </div>
            <div>
              <Label htmlFor="cf-opened-at">Data otwarcia</Label>
              <Input
                id="cf-opened-at"
                type="date"
                value={openedAt}
                max={today}
                onChange={(e) => setOpenedAt(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-lg border border-border2 bg-surface2/40 p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              Nadpisanie „wg XTB” (opcjonalnie)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cf-override-price">Kurs wg XTB</Label>
                <Input
                  id="cf-override-price"
                  inputMode="decimal"
                  value={overridePrice}
                  onChange={(e) => setOverridePrice(e.target.value)}
                  placeholder="puste = szacunek Yahoo"
                />
              </div>
              <div>
                <Label htmlFor="cf-override-pnl">P&L wg XTB (PLN)</Label>
                <Input
                  id="cf-override-pnl"
                  inputMode="decimal"
                  value={overridePnl}
                  onChange={(e) => setOverridePnl(e.target.value)}
                  placeholder="wygrywa nad wszystkim"
                />
              </div>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              XTB wycenia CFD z kontraktu futures FW20, a Yahoo daje kurs
              indeksu kasowego WIG20 — szacunek jest przybliżony. P&L wg XTB
              (jeśli ustawiony) nadpisuje wszystko; bez niego liczy się z
              kursu wg XTB (jeśli podany) albo z szacunku Yahoo.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cf-swap">Swap</Label>
              <Input
                id="cf-swap"
                inputMode="decimal"
                value={swapPln}
                onChange={(e) => setSwapPln(e.target.value)}
                placeholder="skumulowany swap z brokera, może być ujemny"
              />
            </div>
            <div>
              <Label htmlFor="cf-note">Notatka (opcjonalnie)</Label>
              <Input
                id="cf-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="np. broker, powód"
              />
            </div>
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
