// Kolor spółki — jedno źródło prawdy dla formatu przechowywania, walidacji
// i rezolucji koloru użytego w awatarze (CompanyLogo), donucie alokacji
// (AllocationDonut) i badge'u newsów. Framework-agnostyczny (bez
// "server-only") — importowalny zarówno w Server Components, jak i w
// modułach "use client". Patrz docs/plans/kolor-spolki.md.
//
// Format przechowywany w `companies.color` (nullable TEXT):
// - token presetu kategorycznego: "cat-1".."cat-8" albo "cat-other";
// - własny kolor: znormalizowany hex "#rrggbb" (lowercase, 6 cyfr);
// - brak koloru: NULL.
//
// Tokeny są theme-aware (rozwiązują się przez `var(--color-cat-N)` w
// kaskadzie CSS na `<html data-theme>`), hex jest z definicji stały w obu
// motywach — kontrast tekstu na hexie liczymy z luminancji (YIQ), a nie
// z odwracalnego tokenu `--color-cat-ink`.

// Presety do formularza (9 pozycji: cat-1..8 + cat-other — cat-other jest
// wybieralnym presetem, patrz "Decyzje" w planie).
export const CAT_TOKENS = [
  "cat-1",
  "cat-2",
  "cat-3",
  "cat-4",
  "cat-5",
  "cat-6",
  "cat-7",
  "cat-8",
  "cat-other",
] as const;

// Pula fallbacku hasha — BEZ "cat-other", parytet z dzisiejszym
// AVATAR_PALETTE z CompanyLogo.tsx (przed wyniesieniem tutaj). Lokalna (nie
// eksportowana) — na zewnątrz wystarcza hashToken/avatarBackground/avatarInk.
const AVATAR_TOKENS = CAT_TOKENS.filter((t) => t !== "cat-other");

const TOKEN_RE = /^cat-([1-8]|other)$/;
const HEX_RE = /^#[0-9a-f]{6}$/;

// Deterministyczny hash string→liczba — kalka 1:1 dawnego hashString()
// z CompanyLogo.tsx (żeby fallback koloru awatara nie zmienił się po
// wyniesieniu logiki tutaj). Lokalna — używana tylko przez hashToken.
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Deterministyczny token z hasha tickera — ten sam mechanizm i ta sama pula
// 8 tokenów co dawny `AVATAR_PALETTE[hashString(ticker.toUpperCase()) % 8]`.
export function hashToken(ticker: string): string {
  return AVATAR_TOKENS[hashString(ticker.toUpperCase()) % AVATAR_TOKENS.length];
}

export interface NormalizeColorResult {
  ok: boolean;
  value: string | null;
}

// Normalizuje wejście z formularza/API do formatu przechowywanego w DB.
// `null`/`undefined`/"" → brak koloru (poprawna wartość, nie błąd — patrz
// "Decyzje" w planie: to wyczyszczenie, nie invalid). Token → jw. (lowercase).
// "#rrggbb" lub "rrggbb" → "#rrggbb" (lowercase). Cokolwiek innego → invalid.
// Reużywane przez POST /api/companies i PATCH /api/companies/[id] oraz przez
// CompanyForm (walidacja/podgląd po stronie klienta).
export function normalizeColor(input: unknown): NormalizeColorResult {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: false, value: null };

  const trimmed = input.trim().toLowerCase();
  if (trimmed === "") return { ok: true, value: null };

  if (TOKEN_RE.test(trimmed)) return { ok: true, value: trimmed };

  const hex = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  if (HEX_RE.test(hex)) return { ok: true, value: hex };

  return { ok: false, value: null };
}

function tokenVar(token: string): string {
  return `var(--color-${token})`;
}

// Rezolwer tła — do `style.background`. Token → nazwa zmiennej CSS (sama
// referencja, brak `getComputedStyle` — deterministyczne i identyczne na
// SSR/kliencie, patrz ostrzeżenie w AllocationDonut.tsx). Hex → wartość wprost.
// `null`/nieprawidłowa wartość → `null` (wywołujący decyduje o fallbacku:
// hash w avatarze/badge'u, slot palety w donucie).
export function resolveColorBackground(
  color: string | null | undefined
): string | null {
  if (!color) return null;
  if (TOKEN_RE.test(color)) return tokenVar(color);
  if (HEX_RE.test(color)) return color;
  return null;
}

// YIQ (percepcyjna jasność) — próg 128 to standardowa granica jasne/ciemne.
function inkForHex(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#1c1712" : "#fbf5e9";
}

// Rezolwer tekstu — do `style.color`. Token → `var(--color-cat-ink)` (już
// odwracany między motywami w globals.css). Hex → stały atrament liczony
// z luminancji (hex nie adaptuje się do motywu — świadome, patrz Non-goals).
// `null`/nieprawidłowa wartość → `null`.
export function resolveColorInk(color: string | null | undefined): string | null {
  if (!color) return null;
  if (TOKEN_RE.test(color)) return "var(--color-cat-ink)";
  if (HEX_RE.test(color)) return inkForHex(color);
  return null;
}

// Wygodne warianty z fallbackiem na hash tickera — do awatara-fallbacku
// (CompanyLogo) i wypełnionego badge'a newsów: własny kolor, gdy ustawiony,
// inaczej dokładnie ten sam deterministyczny hash co dziś.
export function avatarBackground(
  color: string | null | undefined,
  ticker: string
): string {
  return resolveColorBackground(color) ?? tokenVar(hashToken(ticker));
}

export function avatarInk(color: string | null | undefined): string {
  // Fallback (brak/niepoprawny kolor) zawsze spada na kolor z hasha tickera,
  // czyli token kategoryczny, którego atrament to zawsze var(--color-cat-ink)
  // (odwracany między motywami) — wynik nie zależy od tickera, więc nie
  // przyjmujemy go jako argumentu.
  return resolveColorInk(color) ?? "var(--color-cat-ink)";
}
