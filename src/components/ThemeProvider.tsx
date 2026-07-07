"use client";

// Context motywu — stan seedowany propem `initial` z serwera (SSR, bez FOUC).
// Przełączenie: (1) natychmiast ustawia atrybut na <html>, (2) aktualizuje stan
// kontekstu (żeby konsumenci — wykresy — się przerenderowali), (3) utrwala wybór
// w DB + ciasteczku przez POST /api/settings. Bez router.refresh() — atrybut i
// tak jest już zmieniony w DOM, a kolory poza wykresami idą przez CSS.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (next: Theme) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  initial,
  children,
}: {
  initial: Theme;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initial);

  const setTheme = useCallback((next: Theme) => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = next;
    }
    setThemeState(next);
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {
      // Utrwalenie w DB/ciasteczku to najlepszy wysiłek — motyw w bieżącej
      // sesji już się zmienił (DOM + stan), błąd sieci nie musi go cofać.
    });
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggle }),
    [theme, setTheme, toggle]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme musi być użyty wewnątrz ThemeProvider");
  return ctx;
}

// Domyślne (dark) wartości tokenów — fallback, gdy hook jest wywołany podczas
// SSR (brak `document`); recharts i lightweight-charts i tak renderują
// realnie dopiero po stronie klienta.
const FALLBACK_COLORS = {
  bg: "#0d0d0d",
  surface: "#1a1a19",
  surface2: "#232321",
  border: "#2c2c2a",
  border2: "#383835",
  ink: "#ffffff",
  ink2: "#c3c2b7",
  muted: "#898781",
  accent: "#3987e5",
  accentDeep: "#1c5cab",
  pos: "#0ca30c",
  neg: "#e66767",
  warn: "#fab219",
  cat1: "#3987e5",
  cat2: "#199e70",
  cat3: "#c98500",
  cat4: "#008300",
  cat5: "#9085e9",
  cat6: "#e66767",
  cat7: "#d55181",
  cat8: "#d95926",
  catOther: "#898781",
} as const;

export type ThemeColors = { [K in keyof typeof FALLBACK_COLORS]: string };

function readVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

// Odczytuje aktualne tokeny CSS (`--color-*`) przez getComputedStyle —
// jedno źródło prawdy w CSS, przeliczane przy każdej zmianie motywu.
export function useThemeColors(): ThemeColors {
  const { theme } = useTheme();

  return useMemo(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return FALLBACK_COLORS;
    }
    // `theme` sam nie jest odczytywany niżej — jest zależnością celową:
    // wymusza ponowny odczyt zmiennych CSS z DOM po przełączeniu motywu
    // (wartości `--color-*` zmieniają się dopiero po aktualizacji
    // `document.documentElement.dataset.theme`).
    void theme;
    return {
      bg: readVar("--color-bg", FALLBACK_COLORS.bg),
      surface: readVar("--color-surface", FALLBACK_COLORS.surface),
      surface2: readVar("--color-surface2", FALLBACK_COLORS.surface2),
      border: readVar("--color-border", FALLBACK_COLORS.border),
      border2: readVar("--color-border2", FALLBACK_COLORS.border2),
      ink: readVar("--color-ink", FALLBACK_COLORS.ink),
      ink2: readVar("--color-ink2", FALLBACK_COLORS.ink2),
      muted: readVar("--color-muted", FALLBACK_COLORS.muted),
      accent: readVar("--color-accent", FALLBACK_COLORS.accent),
      accentDeep: readVar("--color-accent-deep", FALLBACK_COLORS.accentDeep),
      pos: readVar("--color-pos", FALLBACK_COLORS.pos),
      neg: readVar("--color-neg", FALLBACK_COLORS.neg),
      warn: readVar("--color-warn", FALLBACK_COLORS.warn),
      cat1: readVar("--color-cat-1", FALLBACK_COLORS.cat1),
      cat2: readVar("--color-cat-2", FALLBACK_COLORS.cat2),
      cat3: readVar("--color-cat-3", FALLBACK_COLORS.cat3),
      cat4: readVar("--color-cat-4", FALLBACK_COLORS.cat4),
      cat5: readVar("--color-cat-5", FALLBACK_COLORS.cat5),
      cat6: readVar("--color-cat-6", FALLBACK_COLORS.cat6),
      cat7: readVar("--color-cat-7", FALLBACK_COLORS.cat7),
      cat8: readVar("--color-cat-8", FALLBACK_COLORS.cat8),
      catOther: readVar("--color-cat-other", FALLBACK_COLORS.catOther),
    };
  }, [theme]);
}
