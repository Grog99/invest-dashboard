"use client";

// Ręczny przełącznik jasny/ciemny — wpięty w Sidebar, widoczny z każdej strony.

import { Button } from "./ui";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={toggle}
      className="w-full"
      aria-label={
        isDark ? "Przełącz na motyw jasny" : "Przełącz na motyw ciemny"
      }
    >
      <span className="flex flex-1 items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span aria-hidden>{isDark ? "🌙" : "☀️"}</span>
          {isDark ? "Ciemny" : "Jasny"}
        </span>
        <span className="text-muted">Zmień</span>
      </span>
    </Button>
  );
}
