"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { Button, Input, Label, Select } from "./ui";
import type { Company } from "@/db/schema";
import { suggestQuoteSymbol } from "@/lib/yahoo";

export function CompanyModalButton({
  company,
  defaultWatchlist = false,
  label,
  variant = "primary",
  size = "md",
}: {
  company?: Company;
  defaultWatchlist?: boolean;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ticker, setTicker] = useState(company?.ticker ?? "");
  const [name, setName] = useState(company?.name ?? "");
  const [market, setMarket] = useState(company?.market ?? "GPW");
  const [currency, setCurrency] = useState(company?.currency ?? "PLN");
  const [quoteSymbol, setQuoteSymbol] = useState(company?.quoteSymbol ?? "");
  const [aliases, setAliases] = useState(company?.aliases ?? "");
  const [domain, setDomain] = useState(company?.domain ?? "");
  const [type, setType] = useState(company?.type ?? "STOCK");
  const [watchlist, setWatchlist] = useState(
    company ? company.watchlist === 1 : defaultWatchlist
  );

  const onMarketChange = (m: string) => {
    setMarket(m);
    if (!company) setCurrency(m === "US" ? "USD" : "PLN");
  };

  // Auto-watchlista: wybór typu Indeks przy tworzeniu nowej spółki domyślnie
  // zaznacza obserwację (indeks nie ma pozycji, więc watchlist to jedyny sens).
  const onTypeChange = (t: string) => {
    setType(t);
    if (!company && t === "INDEX") setWatchlist(true);
  };

  const suggestedSymbol =
    ticker.trim() !== "" ? suggestQuoteSymbol(ticker, market, type) : "";

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ticker,
        name,
        market,
        currency,
        quoteSymbol: quoteSymbol || suggestedSymbol,
        aliases,
        domain,
        type,
        watchlist,
      };
      const res = await fetch(
        company ? `/api/companies/${company.id}` : "/api/companies",
        {
          method: company ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (data.refreshError) {
        // Spółka dodana, ale notowania nie zeszły — informujemy, nie blokujemy.
        alert(`Spółka zapisana, ale nie pobrano notowań: ${data.refreshError}`);
      }
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
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={company ? `Edytuj: ${company.ticker}` : "Dodaj spółkę"}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="cf-ticker">Ticker</Label>
              <Input
                id="cf-ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="np. PKN, AAPL"
              />
            </div>
            <div>
              <Label htmlFor="cf-market">Rynek</Label>
              <Select
                id="cf-market"
                value={market}
                onChange={(e) => onMarketChange(e.target.value)}
              >
                <option value="GPW">GPW</option>
                <option value="US">USA</option>
                <option value="OTHER">Inny</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="cf-type">Typ</Label>
              <Select
                id="cf-type"
                value={type}
                onChange={(e) => onTypeChange(e.target.value)}
              >
                <option value="STOCK">Akcje</option>
                <option value="ETF">ETF</option>
                <option value="INDEX">Indeks</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="cf-name">Nazwa spółki</Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Orlen S.A."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cf-currency">Waluta</Label>
              <Input
                id="cf-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                placeholder="PLN / USD / EUR"
              />
            </div>
            <div>
              <Label htmlFor="cf-symbol">Symbol notowań (Yahoo)</Label>
              <Input
                id="cf-symbol"
                value={quoteSymbol}
                onChange={(e) => setQuoteSymbol(e.target.value.toUpperCase())}
                placeholder={suggestedSymbol || "np. PKN.WA, AAPL"}
              />
            </div>
          </div>
          {type === "INDEX" && (
            <p className="text-[11px] leading-relaxed text-muted">
              Indeks = tylko podgląd (wykres + watchlista), bez pozycji. GPW:{" "}
              <code>WIG.WA</code>, USA: <code>^GSPC</code>. Uwaga: WIG20 nie ma
              historii na Yahoo — dla ekspozycji na WIG20 wybierz typ ETF i
              symbol <code>ETFBW20TR.WA</code>.
            </p>
          )}
          <div>
            <Label htmlFor="cf-aliases">
              Aliasy do dopasowania newsów (po przecinku)
            </Label>
            <Input
              id="cf-aliases"
              value={aliases ?? ""}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="np. Orlen, PKN Orlen"
            />
          </div>
          <div>
            <Label htmlFor="cf-domain">Domena (logo spółki)</Label>
            <Input
              id="cf-domain"
              value={domain ?? ""}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="orlen.pl"
            />
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Opcjonalna — jeśli pusta, logo próbujemy dobrać automatycznie po
              tickerze/nazwie.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink2">
            <input
              type="checkbox"
              checked={watchlist}
              onChange={(e) => setWatchlist(e.target.checked)}
              className="accent-accent"
            />
            Obserwuj na watchliście
          </label>
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
