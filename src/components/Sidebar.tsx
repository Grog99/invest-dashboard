"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/portfolio", label: "Portfel", icon: "▤" },
  { href: "/watchlist", label: "Watchlista", icon: "◎" },
  { href: "/news", label: "Newsy", icon: "☰" },
  { href: "/research", label: "Research", icon: "✎" },
  { href: "/settings", label: "Ustawienia", icon: "⚙" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-5 pb-4 pt-6">
        <Link href="/" className="block">
          <div className="text-[15px] font-semibold tracking-tight">
            Invest<span className="text-accent"> Dashboard</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            prywatny monitor inwestycji
          </div>
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                active
                  ? "bg-surface2 font-medium text-ink"
                  : "text-ink2 hover:bg-surface2/60 hover:text-ink"
              }`}
            >
              <span
                className={`w-4 text-center text-xs ${active ? "text-accent" : "text-muted"}`}
                aria-hidden
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-4">
        <ThemeToggle />
        <div className="mt-3 text-[11px] leading-relaxed text-muted">
          Notowania: Yahoo Finance (~15 min opóźnienia)
          <br />
          Kursy walut: NBP
        </div>
      </div>
    </aside>
  );
}
