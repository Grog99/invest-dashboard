// Współdzielone klocki UI — bez "use client", działają po obu stronach.
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { fmtPct, fmtSignedMoney } from "@/lib/format";

export function Card({
  children,
  className = "",
  title,
  actions,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border border-border bg-surface ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink2">
            {title}
          </h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "pos" | "neg";
}) {
  const toneClass =
    tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-ink";
  return (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div
        className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${toneClass}`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-ink2">{sub}</div>}
    </div>
  );
}

// Kwota/procent ze znakiem i kolorem (zielony/czerwony/neutralny).
export function Delta({
  value,
  currency,
  pct,
  className = "",
}: {
  value?: number | null;
  currency?: string;
  pct?: number | null;
  className?: string;
}) {
  const primary = value ?? pct;
  if (primary === null || primary === undefined) {
    return <span className={`text-muted ${className}`}>—</span>;
  }
  const tone =
    primary > 0.000001 ? "text-pos" : primary < -0.000001 ? "text-neg" : "text-ink2";
  return (
    <span className={`${tone} ${className}`}>
      {value !== null && value !== undefined
        ? fmtSignedMoney(value, currency ?? "PLN")
        : null}
      {value !== null && value !== undefined && pct !== null && pct !== undefined
        ? " "
        : null}
      {pct !== null && pct !== undefined ? `(${fmtPct(pct)})` : null}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
  size = "sm",
  bg,
  ink,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "pos" | "neg" | "warn";
  size?: "sm" | "md";
  // Wypełnione tło inline (kolor spółki — CompanyLogo/badge newsów). Gdy
  // ustawione, nadpisuje klasy `tone` zamiast się z nimi łączyć; bez `bg`
  // zachowanie jest identyczne jak wcześniej. Patrz docs/plans/kolor-spolki.md.
  bg?: string;
  ink?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-surface2 text-ink2 border-border2",
    accent: "bg-accent/15 text-accent border-accent/30",
    pos: "bg-pos/15 text-pos border-pos/30",
    neg: "bg-neg/15 text-neg border-neg/30",
    warn: "bg-warn/15 text-warn border-warn/30",
  };
  const sizes: Record<string, string> = {
    sm: "px-1.5 py-0.5 text-[11px]",
    md: "px-2 py-0.5 text-[12px]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${bg ? "border-transparent" : tones[tone]} ${sizes[size]}`}
      style={bg ? { background: bg, color: ink } : undefined}
    >
      {children}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary:
      "bg-accent text-accent-ink hover:bg-accent-deep border border-transparent",
    secondary:
      "bg-surface2 text-ink border border-border2 hover:border-muted",
    ghost: "bg-transparent text-ink2 border border-transparent hover:bg-surface2",
    danger:
      "bg-transparent text-neg border border-neg/40 hover:bg-neg/10",
  };
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1 text-[12px]",
    md: "px-3.5 py-1.5 text-[13px]",
  };
  return (
    <button
      className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-border2 bg-surface2 px-3 py-1.5 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-border2 bg-surface2 px-3 py-1.5 text-[13px] text-ink focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-border2 bg-surface2 px-3 py-2 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none ${className}`}
      {...props}
    />
  );
}

export function Label({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-[12px] font-medium text-ink2"
    >
      {children}
    </label>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="text-[14px] font-medium text-ink2">{title}</div>
      {hint && <div className="max-w-md text-[12px] text-muted">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  actions,
  icon,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </div>
  );
}

// Tabela — nagłówki i komórki w spójnym stylu.
export function Table({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-border2 text-left text-[11px] uppercase tracking-wide text-muted">
            {head}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  right = false,
}: {
  children?: ReactNode;
  right?: boolean;
}) {
  return (
    <th className={`px-2.5 py-2 font-medium ${right ? "text-right" : ""}`}>
      {children}
    </th>
  );
}

// Para label/value w kartach mobilnych (widoki kartowe tabel na < md) —
// współdzielony markup, żeby uniknąć powtórzenia w kilku plikach.
export function Field({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className="text-[13px] text-ink">{children}</div>
    </div>
  );
}

export function Td({
  children,
  right = false,
  className = "",
}: {
  children?: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`border-b border-border px-2.5 py-2 align-middle ${right ? "text-right tabular-nums" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
