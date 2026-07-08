// Współdzielone dane nawigacji — jedno źródło prawdy dla Sidebara (desktop)
// i BottomNav (mobile). Zwykły moduł danych, bez "use client", importowalny
// po obu stronach.

export type NavItem = {
  href: string;
  label: string;
  icon: string;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "◧" },
  { href: "/portfolio", label: "Portfel", icon: "▤" },
  { href: "/watchlist", label: "Watchlista", icon: "◎" },
  { href: "/news", label: "Newsy", icon: "☰" },
  { href: "/research", label: "Research", icon: "✎" },
  { href: "/settings", label: "Ustawienia", icon: "⚙" },
];

// Pasek dolny (mobile): 4 stałe pozycje.
export const PRIMARY_NAV: NavItem[] = NAV.slice(0, 4);

// Reszta trafia pod przycisk „Więcej” (bottom sheet).
export const SECONDARY_NAV: NavItem[] = NAV.slice(4);
