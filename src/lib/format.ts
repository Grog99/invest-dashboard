export function fmtMoney(value: number, currency = "PLN"): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function fmtNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("pl-PL", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function fmtQty(value: number): string {
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 6,
  }).format(value);
}

export function fmtPct(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${fmtNumber(value, digits)}%`;
}

export function fmtSignedMoney(value: number, currency = "PLN"): string {
  const sign = value > 0 ? "+" : "";
  return sign + fmtMoney(value, currency);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("pl-PL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

// Klucz deduplikacji newsów: znormalizowany tytuł + dzień publikacji.
// Współdzielony przez backfill (src/db/index.ts) i runtime (src/lib/news.ts),
// żeby oba liczyły ten sam klucz dla tego samego artykułu (patrz ADR/plan
// scalania duplikatów — SQL-owy lower() jest ASCII-only i rozjeżdża się
// z JS toLowerCase() dla polskich wielkich liter).
export function computeDedupKey(
  title: string,
  publishedAt: string | null
): string | null {
  const t = title.trim().toLowerCase();
  const day = (publishedAt ?? "").slice(0, 10);
  if (!t || day.length < 10) return null; // brak daty → nie deduplikujemy po kluczu, tylko po url
  return `${t}|${day}`;
}
