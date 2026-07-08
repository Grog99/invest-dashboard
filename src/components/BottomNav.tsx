"use client";

// Dolna nawigacja mobile (< md): 4 stałe pozycje + przycisk „Więcej”
// otwierający bottom sheet z resztą nawigacji (Research/Ustawienia),
// przełącznikiem motywu i stopką informacyjną. Sidebar (desktop, >= md)
// hostuje te same pozycje inaczej — patrz components/Sidebar.tsx i
// współdzielone dane w components/nav.ts.
//
// Mechanika Escape + blokady scrolla skopiowana z components/Modal.tsx.
// Sheet zostaje w DOM zawsze (translate-y-full gdy zamknięty), żeby wjazd
// (`transform`) mógł się animować — global reguła w globals.css transitionuje
// tylko background/border/color, więc transform dokładamy lokalnie.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { PRIMARY_NAV, SECONDARY_NAV } from "./nav";

export function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Nawigacja (zmiana pathname) zamyka sheet — inaczej zostałby otwarty nad
  // nową stroną. Dopasowanie stanu do zmiany propsa/routingu w trakcie
  // renderu (nie w useEffect) — wzorzec z dokumentacji Reacta „Adjusting
  // state when a prop changes”; unika kaskadowego dodatkowego renderu, na
  // który wskazuje reguła react-hooks/set-state-in-effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const moreActive =
    pathname.startsWith("/research") || pathname.startsWith("/settings");

  return (
    <>
      {/* Scrim */}
      <div
        onMouseDown={() => setOpen(false)}
        className={`fixed inset-0 z-50 bg-black/60 transition-opacity duration-200 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden="true"
      />

      {/* Bottom sheet „Więcej” */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Więcej"
        style={{
          transition:
            "transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease",
        }}
        className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:hidden ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <nav className="space-y-0.5">
          {SECONDARY_NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors ${
                  active
                    ? "bg-surface2 font-medium text-ink"
                    : "text-ink2 hover:bg-surface2/60 hover:text-ink"
                }`}
              >
                <span
                  className={`w-5 text-center ${active ? "text-accent" : "text-muted"}`}
                  aria-hidden
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="my-3 border-t border-border" />
        <ThemeToggle />
        <div className="mt-3 text-[11px] leading-relaxed text-muted">
          Notowania: Yahoo Finance (~15 min opóźnienia)
          <br />
          Kursy walut: NBP
        </div>
      </div>

      {/* Pasek dolny */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label="Nawigacja główna"
      >
        {PRIMARY_NAV.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
                active ? "font-medium text-ink" : "text-ink2"
              }`}
            >
              <span
                className={`text-base ${active ? "text-accent" : "text-muted"}`}
                aria-hidden
              >
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Więcej"
          className={`flex cursor-pointer flex-col items-center justify-center gap-0.5 py-2 text-[10px] ${
            moreActive || open ? "font-medium text-ink" : "text-ink2"
          }`}
        >
          <span
            className={`text-base ${moreActive || open ? "text-accent" : "text-muted"}`}
            aria-hidden
          >
            ⋯
          </span>
          Więcej
        </button>
      </nav>
    </>
  );
}
