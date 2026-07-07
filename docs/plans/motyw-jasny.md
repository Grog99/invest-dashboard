# Motyw jasny

> Plan wygenerowany przez skill `/plan-feature`. Slug: `motyw-jasny`. Branch: `feature/motyw-jasny`.

## Kontekst / Problem

Aplikacja ma dziś tylko jedną, ciemną paletę — tokeny kolorów siedzą w bloku `@theme`
w `src/app/globals.css` (Tailwind v4). Ciemny motyw był świadomie walidowany jako
podstawowy (paleta dataviz, dark mode), ale przy pracy dziennej biały interfejs bywa
wygodniejszy. Zadanie (roadmapa 6.5): dodać wariant jasny, przełączany **ręcznie**
z poziomu UI, i utrwalać wybór.

Główna trudność nie leży w samym CSS (Tailwind v4 pozwala nadpisać zmienne pod
selektorem), tylko w:
1. komponentach wykresów, które dostają kolory jako stringi w JS
   (`AreaChart`/`PriceChart` na lightweight-charts oraz `AllocationDonut` na recharts) —
   muszą czytać aktualny motyw i przemalowywać się przy zmianie;
2. uniknięciu FOUC / hydration mismatch przy SSR — `<html>` musi już w pierwszym
   HTML mieć poprawny atrybut motywu, zanim przeglądarka cokolwiek namaluje.

## Ustalenia (decyzje użytkownika — wiążące)

- **Mechanizm:** ręczny przełącznik w UI (jawny wybór), **nie** `prefers-color-scheme`
  ani tryb hybrydowy auto+override.
- **Lokalizacja przełącznika:** w `Sidebar` (widoczny z każdej strony), **nie** na
  stronie Ustawień.
- **Motyw domyślny:** **ciemny** (zgodnie z obecnym, jedynym stanem aplikacji).
- **Zakres wykresów:** pełne wsparcie — `PriceChart`/`AreaChart` i `AllocationDonut`
  też przełączają kolory zgodnie z motywem (nie zostają na sztywno ciemne).
- **Paleta jasna:** zaakceptowany zestaw startowy z sekcji „Pliki do zmiany" (bez
  wymogu formalnego przejścia WCAG przed mergem — można doszlifować kontrast później).
- **Paleta kategoryczna donuta:** wariant (a) — tokeny CSS `--color-cat-*` w
  `globals.css` (dark + light), jedno źródło prawdy; **nie** dwie tablice JS.
- **Ciasteczko `theme`:** `httpOnly: true` — JS nigdy nie czyta go bezpośrednio
  (tylko `document.documentElement.dataset.theme`), więc `httpOnly` jest czystsze
  bez utraty funkcjonalności.
- **Przełączanie motywu:** płynne przejście kolorów przez CSS `transition`
  (subtelny fade tła/tekstu), nie zmiana natychmiastowa.

## Wymagania

- Ręczny przełącznik jasny/ciemny w `Sidebar`, działający z każdej strony.
- Wybór utrwalany w tabeli `settings` (klucz `theme`), zgodnie z wzorcem pozostałych
  ustawień (openrouter, cron); domyślnie `dark`.
- Po pełnym przeładowaniu strony motyw jest odtwarzany **bez migotania** (SSR renderuje
  poprawny atrybut `data-theme` już w pierwszym HTML).
- Brak ostrzeżeń o niezgodności hydratacji w konsoli.
- Wykresy (obie biblioteki) przemalowują kolory przy przełączeniu motywu, bez potrzeby
  przeładowania strony.
- Markdown, tooltipy, obramowania itd. dziedziczą motyw automatycznie przez tokeny CSS
  (nie wymagają osobnej pracy — dziś już używają `var(--color-*)`).

## Zakres i Non-goals

**W zakresie:**
- Definicja jasnych wartości tokenów obok istniejących ciemnych w `globals.css`.
- Provider/hook motywu (React Context) + przełącznik w `Sidebar`.
- Odczyt motywu w root layout dla SSR (bez FOUC) i utrwalanie w `settings` + ciasteczku.
- Przemalowanie `AreaChart`, `PriceChart`, `AllocationDonut`.

**Non-goals (świadomie pomijamy):**
- Automatyczne dopasowanie do `prefers-color-scheme` (decyzja: tryb ręczny).
- Więcej niż dwa motywy / motywy per-strona / kolory akcentu do wyboru.
- Animowane przejście kolorów przy przełączeniu (opcjonalny szlif, nie warunek „done").
- Zmiana palety kategorycznej dataviz jako takiej — jedynie dobranie jej wariantu light.

## Podejście

> Uwaga wg `AGENTS.md`: API Next.js zweryfikowane w `node_modules/next/dist/docs/` —
> `01-app/01-getting-started/05-server-and-client-components.md` (wzorzec ThemeProvider
> jako Client Component owijający `children` renderowane po stronie serwera),
> `01-app/03-api-reference/03-file-conventions/layout.md` (root layout definiuje
> `<html>`; **layouty nie re-renderują się przy nawigacji klienckiej** i nie mają
> dostępu do surowego requestu — request-time dane czyta się przez `cookies()`),
> `01-app/03-api-reference/04-functions/cookies.md` (`cookies()` jest **async** w
> Next 16 i jego użycie w layout/page **opt-in do dynamic rendering**; `.set()` działa
> w Route Handlerze).

**1. Tokeny w CSS jako jedyne źródło prawdy o kolorach.**
Blok `@theme` w `globals.css` jest zwykłym (nie `inline`) `@theme`, więc Tailwind v4
generuje utilki jako `background-color: var(--color-surface)` itd. Wartości ciemne
zostają jako baza w `:root` (przez `@theme`), a wariant jasny to **nadpisanie tych
samych zmiennych** pod bardziej szczegółowym selektorem `:root[data-theme="light"]`
(specyficzność atrybutu > gołego `:root`, więc wygrywa). Dzięki temu wszystkie utilki
Tailwinda, `.markdown`, `::selection`, scrollbary itd. przełączają się „za darmo".

**2. `data-theme` na `<html>` renderowane po stronie serwera — to eliminuje FOUC.**
Root layout (`src/app/layout.tsx`) staje się `async` i czyta motyw w kolejności:
ciasteczko `theme` → (fallback) `getTheme()` z `settings` w DB → (fallback) `dark`.
Wynik trafia jako `data-theme={theme}` na `<html>`. Ponieważ atrybut jest w pierwszym
HTML, CSS wariantu jasnego stosuje się przed pierwszym malowaniem — brak migotania.

Dlaczego ciasteczko jako podstawowy odczyt renderujący, skoro źródłem prawdy jest DB?
Bo `cookies()` to udokumentowany, request-time sposób czytania danych w layoucie i
**automatycznie wymusza dynamic rendering tego renderu** (patrz cookies.md), więc nie
trzeba globalnie ustawiać `force-dynamic` na root layoucie (co wyłączyłoby statyczną
optymalizację dla całej apki). DB (`settings`) pozostaje trwałym źródłem prawdy
(spójne z resztą ustawień, wchodzi do kopii pliku `data/invest.db`), a ciasteczko jest
tylko jego szybkim, dostępnym w czasie żądania lustrem, aktualizowanym w tym samym
Route Handlerze. Zapis idzie do obu naraz.

_Rozważona alternatywa (odrzucona jako podstawowa):_ odczyt wyłącznie z DB w root
layoucie + `export const dynamic = "force-dynamic"` na layoucie. Działa i jest jednym
źródłem prawdy (bez ciasteczka), ale globalnie wyłącza statyczny render i nie korzysta
z udokumentowanego wzorca `cookies()` w layoucie. Apka i tak ma `force-dynamic` na
każdej stronie, więc różnica praktyczna jest mała — zostawiamy jako tańszy wariant,
gdyby ciasteczko było niepożądane (patrz Pytania).

_Rozważona alternatywa (odrzucona):_ klasyczny inline-script w `<head>` czytający
`localStorage` przed hydracją. Niepotrzebny, bo SSR ma już wartość z ciasteczka/DB;
dokłada za to ryzyko rozjazdu z DB i osobne źródło stanu.

**3. Provider + natychmiastowa reakcja bez przeładowania.**
`ThemeProvider` (Client Component) trzyma stan motywu (seed z propa `initial` z serwera,
więc kontekst zgadza się przy hydratacji). Przełączenie:
1. imperatywnie ustawia `document.documentElement.dataset.theme = next` — natychmiastowy
   efekt wizualny, bez czekania na round-trip;
2. aktualizuje stan kontekstu, żeby konsumenci (wykresy) się przerenderowali;
3. `POST /api/settings { theme: next }` (utrwalenie w DB + ciasteczku).

`router.refresh()` **nie** jest potrzebny (atrybut i tak zmieniony w DOM, a kolory
poza wykresami są sterowane CSS-em) — pomijamy go, żeby przełączenie motywu nie
przeładowywało danych całej strony.

Przejście jest **płynne** (CSS `transition`), nie natychmiastowe: `globals.css` dostaje
regułę `transition: background-color .2s ease, border-color .2s ease, color .2s ease;`
na tokenizowanych właściwościach (najprościej: `*, *::before, *::after { transition: ... }`
ograniczone do tych trzech właściwości, żeby nie dotknąć np. `transform`/layout).
Wykresy (`canvas` lightweight-charts, SVG recharts) fade'a nie dostają — biblioteki
malują na `canvas`/`SVG` poza zasięgiem CSS `transition` dla „kolorów tokenów"; ich
przemalowanie przy `applyOptions`/re-render pozostaje skokowe, co jest akceptowalne
(dominujący, widoczny fade to tło/karty/tekst wokół wykresów).

**4. Wykresy czytają aktualne tokeny.**
Wspólny hook kliencki (`useThemeColors()`) odczytuje wartości tokenów przez
`getComputedStyle(document.documentElement).getPropertyValue('--color-…')`, przeliczany
przy zmianie motywu (zależność od wartości z `useTheme()`). `AreaChart` stosuje kolory
warstwy/siatki/osi przez `chart.applyOptions(...)` oraz kolory serii przez
`series.applyOptions(...)` w efekcie zależnym od motywu; `AllocationDonut` (recharts)
przerenderowuje się reaktywnie, bo konsumuje `useTheme()` i wybiera paletę kategoryczną
zgodną z motywem.

## Pliki do zmiany

**Tokeny / CSS**

> **Uwaga po implementacji:** pierwotny plan (nadpisania jasne bezpośrednio pod
> wartościami w zwykłym `@theme`) **nie zadziałał** — Tailwind v4 z nie-`inline`
> `@theme` piecze wartości tokenów literalnie w jeden bucket `:root`/`@layer theme`
> i **wycina** z wynikowego CSS każdą inną deklarację tej samej nazwy zmiennej
> spoza `@theme` (w tym cały selektor `:root[data-theme="light"]`), a także tokeny
> `@theme`, które nie są użyte jako klasa utility Tailwinda (np. `--color-cat-*`,
> czytane tylko z JS). Faktyczne rozwiązanie: surowe wartości (dark + light) żyją
> w zwykłych, nieteowanych regułach CSS (`:root { ... }` i
> `:root[data-theme="light"] { ... }`, zwykła kaskada), a `@theme inline` niżej
> tylko **aliasuje** je (`--color-bg: var(--color-bg);` itd.) pod nazwy używane
> przez generator utility Tailwinda — `inline` zapobiega zapiekaniu literału.
> `--color-cat-*` nie idą przez `@theme` wcale (nieużywane jako utility, więc i tak
> byłyby wycięte) — zostają czystym CSS, czytanym tylko przez `getComputedStyle`.

- `src/app/globals.css` — pod blokiem `@theme` (bez ruszania wartości ciemnych, które
  są bazą) dodać nadpisania jasne:
  ```css
  :root[data-theme="light"] {
    --color-bg: #ffffff;
    --color-surface: #f7f7f5;
    --color-surface2: #ececea;
    --color-border: #e2e2df;
    --color-border2: #cfcfca;
    --color-ink: #1a1a19;
    --color-ink2: #3f3f3a;
    --color-muted: #6b6a64;
    --color-accent: #1c5cab;      /* ciemniejszy niebieski dla kontrastu na bieli */
    --color-accent-deep: #14468a;
    --color-pos: #0a7a0a;
    --color-neg: #cc4444;
    --color-warn: #b26b00;
  }
  ```
  Wartości powyżej to zaakceptowany punkt startowy (bez formalnego przejścia WCAG przed
  mergem — do doszlifowania później). Dodać też w `@theme` tokeny kategoryczne
  `--color-cat-1..8` + `--color-cat-other` (baza = dzisiejsza paleta z `AllocationDonut`)
  i ich nadpisania w `:root[data-theme="light"]` (patrz sekcja „Wykresy" niżej — wariant
  (a), tokeny CSS, jest wybranym rozwiązaniem, nie tylko opcją).
  Dodać też regułę płynnego przejścia (ograniczoną do `background-color`, `border-color`,
  `color`), żeby przełączenie motywu nie było skokowe:
  ```css
  *, *::before, *::after {
    transition: background-color .2s ease, border-color .2s ease, color .2s ease;
  }
  ```

**Ustawienia / persistencja** — reużyj wzorca z `src/lib/settings.ts`
- `src/lib/settings.ts` — dodać do `SETTING_KEYS`: `theme: "theme"`; stałą
  `DEFAULT_THEME = "dark"`; helper `getTheme(): "dark" | "light"` (odczyt `getSetting`
  z walidacją do jednej z dwóch wartości, fallback `DEFAULT_THEME`).
  Reużyj istniejących `getSetting` / `setSetting`.
- `src/app/api/settings/route.ts` — w `POST` obsłużyć `body.theme`:
  walidacja `∈ {"dark","light"}`, `setSetting(SETTING_KEYS.theme, theme)` **oraz**
  `(await cookies()).set("theme", theme, { path: "/", maxAge: 31536000, sameSite: "lax",
  httpOnly: true })` (`import { cookies } from "next/headers"`). `httpOnly: true`, bo JS
  klienta nigdy nie czyta ciasteczka bezpośrednio — motyw po stronie klienta idzie przez
  `document.documentElement.dataset.theme` i stan Contextu, nie przez odczyt ciasteczka.
  Uczynić `reloadScheduler()` warunkowym —
  wołać tylko gdy w body są pola cron (`cronQuotes`/`cronNews`), żeby przełączenie
  motywu nie przeładowywało crona. `GET` może dodatkowo zwracać `theme` (opcjonalne —
  layout czyta bezpośrednio, nie przez GET).

**Provider + hook** — nowy plik, wzorzec z docs `server-and-client-components.md`
- `src/components/ThemeProvider.tsx` (`"use client"`) — Context `{ theme, setTheme, toggle }`;
  stan seedowany propem `initial: "dark" | "light"`. `setTheme`/`toggle`:
  (1) `document.documentElement.dataset.theme = next`, (2) `setState(next)`,
  (3) `fetch("/api/settings", { method: "POST", body: JSON.stringify({ theme: next }) })`
  (wzorzec zapisu jak w `AiSettingsForm` / `ScheduleSettingsForm`, ale **bez**
  `router.refresh()`). Eksport `useTheme()` oraz hook `useThemeColors()` czytający tokeny
  przez `getComputedStyle` (przeliczany przy zmianie `theme`; na SSR guard
  `typeof window === "undefined"` → zwróć wartości domyślne dark).

**Layout + przełącznik**
- `src/app/layout.tsx` — zmienić na `async`; policzyć
  `const theme = (await cookies()).get("theme")?.value === "light" ? "light"
  : (await cookies()).get("theme")?.value === "dark" ? "dark" : getTheme();`
  (tj. ciasteczko → fallback DB → `dark`); ustawić `data-theme={theme}` na `<html>`;
  owinąć zawartość `<body>` w `<ThemeProvider initial={theme}>` tak, by objąć **i**
  `Sidebar`, **i** `main` (Sidebar musi konsumować kontekst). Metadane bez zmian.
- `src/components/ThemeToggle.tsx` (`"use client"`, nowy) — przycisk konsumujący
  `useTheme()`, ikonka słońce/księżyc; albo wpięty bezpośrednio w `Sidebar`.
- `src/components/Sidebar.tsx` — już `"use client"`; dodać `<ThemeToggle />` (np. w
  stopce obok „Notowania: Yahoo…" albo nad nawigacją). Reużyj istniejącego stylu
  przycisków/utilek z `components/ui.tsx`.

**Wykresy**
- `src/components/charts/AreaChart.tsx` — zastąpić zahardkodowane hexy
  (`textColor: "#898781"`, `grid rgba(44,44,42,0.6)`, `borderColor: "#383835"`,
  `crosshair labelBackgroundColor: "#383835"`, domyślny `color = "#3987e5"`) wartościami
  z `useThemeColors()` (odpowiednio `--color-muted`, `--color-border`, `--color-border2`,
  `--color-accent`). Efekt tworzący wykres jest dziś „mount-only" (`[]`) — kolory
  poziomu wykresu przenieść do osobnego efektu zależnego od motywu
  (`chart.applyOptions({...})`), a kolory serii albo aktualizować przez
  `series.applyOptions(...)`, albo dodać motyw do zależności istniejącego efektu serii
  (`[data, colors]`). Uwaga: `getPropertyValue` zwraca string z możliwą spacją — `trim()`;
  konkatenacja alfy `${hex}40`/`${hex}05` wymaga 6-cyfrowego hexa (tokeny takie są).
- `src/components/charts/PriceChart.tsx` — praktycznie bez zmian (deleguje do
  `AreaChart`, a przyciski zakresu już używają tokenów `text-ink`/`bg-surface2`).
  Zweryfikować tylko, że nie przekazuje twardego `color`.
- `src/components/charts/AllocationDonut.tsx` — `PALETTE`, `OTHER_COLOR` i
  `stroke="#1a1a19"` (przerwa między wycinkami = kolor karty) uzależnić od motywu.
  `stroke` → `--color-surface`. Paleta kategoryczna: tokeny `--color-cat-1..8` +
  `--color-cat-other` w CSS (dark + light, zdefiniowane w `globals.css` jak wyżej),
  czytane przez `useThemeColors()` — jedno źródło prawdy w CSS, nie tablice JS.
  recharts przerenderuje się sam, bo komponent konsumuje kontekst. Tooltip donuta już
  jest tokenowy (`border-border2`, `bg-surface2`, `text-ink`) — bez zmian.

## Kryteria akceptacji

- [ ] W `Sidebar` jest przełącznik motywu widoczny z każdej podstrony; kliknięcie
      natychmiast zmienia wygląd bez przeładowania.
- [ ] Po pełnym przeładowaniu (F5) w motywie jasnym strona maluje się od razu na jasno —
      **brak** błysku ciemnego tła (weryfikacja wizualna + brak inline-hacka).
- [ ] Wybór przeżywa restart serwera (wiersz `theme` w tabeli `settings` w `data/invest.db`).
- [ ] `AreaChart`/`PriceChart`: linia, siatka, osie i etykiety crosshaira zmieniają kolor
      po przełączeniu; wartości serii (line/top/bottom) też.
- [ ] `AllocationDonut`: wycinki, „Inne" i przerwa (stroke) zgodne z motywem.
- [ ] Konsola przeglądarki bez ostrzeżeń o hydration mismatch przy wejściu i po
      przełączeniu.
- [ ] Motyw ciemny wygląda identycznie jak dziś (regresja zerowa — dark to baza).
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się i feature działa w preview.

## Ryzyka

- **Statyczny prerender root layoutu** zabetonowałby domyślny motyw, gdyby czytać DB bez
  request-time API. Mityguje `cookies()` (opt-in do dynamic rendering) — wybrany wariant
  z ciasteczkiem `theme` (`httpOnly`), więc `force-dynamic` na root layoucie nie jest
  potrzebny.
- **Hydration mismatch**, jeśli stan providera nie jest seedowany wartością serwera —
  seed przez prop `initial`. `<html data-theme>` jest sterowane serwerowo, a root layout
  (Server Component) nie re-renderuje się na kliencie, więc atrybut się nie rozjeżdża.
- **lightweight-charts**: dzisiejszy efekt tworzenia wykresu jest `[]` (mount-only) —
  bez przeniesienia kolorów do efektu zależnego od motywu kolory nie zaktualizują się po
  przełączeniu.
- **getComputedStyle na SSR** — brak `document`; hook musi mieć guard i wartości
  fallback (recharts i tak renderuje realnie dopiero po stronie klienta).
- **Tailwind v4**: nadpisania muszą mieć wyższą specyficzność niż `:root`
  (`:root[data-theme="light"]` ją ma) i `@theme` **nie może** być `inline` (nie jest) —
  inaczej utilki inline'ują wartość i nadpisanie zmiennej nie zadziała.
- **Kontrast / dostępność palety jasnej** — `accent`/`pos`/`neg` z palety dark są za
  jasne na bieli; nie odwracać naiwnie, tylko wziąć walidowaną paletę light (WCAG).
- **Format tokenu koloru** — hook zwraca string z ewentualną spacją (`trim()`); dla
  półprzezroczystych warstw wykresu potrzebny 6-cyfrowy hex, żeby `${hex}40` było poprawne.
- **`reloadScheduler()` w `POST /api/settings`** jest dziś bezwarunkowy — bez uwarunkowania
  go polami cron przełączanie motywu bez potrzeby przeładowywałoby harmonogram crona.

## Pytania do doprecyzowania

Brak otwartych pytań — wszystkie decyzje z poprzedniej rundy rozstrzygnięte i wpisane
do sekcji „Ustalenia" oraz odpowiednio do „Podejście" / „Pliki do zmiany".
