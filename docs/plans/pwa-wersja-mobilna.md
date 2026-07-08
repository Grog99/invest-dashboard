# PWA / wersja mobilna

> Plan wygenerowany przez skill `/plan-feature`. Slug: `pwa-wersja-mobilna`. Branch: `feature/pwa-wersja-mobilna`.

## Kontekst / Problem

Roadmapa 6.6: aplikacja ma dziś jeden, „desktopowy” layout — stały `Sidebar` o szerokości
`w-52` (208 px), przyklejony po lewej (`src/app/layout.tsx` → `<div className="flex min-h-screen">`
z `<Sidebar />` + `<main>`), oraz tabele portfela/watchlisty z 7–8 kolumnami. Na telefonie
(~360–390 px szerokości) sidebar zjada ponad połowę ekranu, a tabele wychodzą w poziomy scroll
(`<Table>` w `components/ui.tsx` owija zawartość w `overflow-x-auto`). Efekt: „działa, ale
niewygodnie”.

Zależność 6.3 (deployment spoza localhost przez Coolify + Pangolin) jest **już zrobiona**, więc
podgląd portfela z telefonu jest realnie użyteczny — brakuje tylko instalowalności (PWA) i
responsywnego shellu.

Cel: (1) aplikacja instalowalna z przeglądarki mobilnej („Dodaj do ekranu głównego”) — `manifest`
+ ikony + poprawny `viewport`/`themeColor`; (2) w pełni responsywny layout — na wąskich ekranach
`Sidebar` ustępuje miejsca dolnej nawigacji, a tabele zamieniają się w karty.

## Ustalenia (decyzje użytkownika — wiążące)

- **Zakres PWA:** tylko instalowalność (`manifest` + ikony + „Add to Home Screen”) i pełna
  responsywność. **Bez service workera, bez cache’u offline, bez push** — dane i tak wymagają
  sieci do serwera, więc SW jest świadomym non-goalem tej iteracji.
- **Dolna nawigacja:** **nie** kopiujemy 1:1 sześciu pozycji sidebara. Pasek dolny ma **4 stałe
  pozycje** — Dashboard, Portfel, Watchlista, Newsy — plus **piąty przycisk „Więcej”**
  rozwijający Research i Ustawienia (UX rozwinięcia zaprojektowany niżej: bottom sheet).
- **Zakres przebudowy:** **wszystkie** strony (`src/app/**/page.tsx`) dostają przegląd pod mobile
  w tym PR; dla każdej w sekcji „Pliki do zmiany” jest wprost napisane, co się zmienia — albo
  „bez zmian, już responsywna”.
- **Ikony PWA:** brak realnych assetów (jest tylko domyślne `src/app/favicon.ico` z Next.js).
  Generujemy **programowo**: monogram „ID” (Invest Dashboard) na tle koloru accent, rasteryzowany
  do PNG skryptem Node z użyciem `sharp` (już w `dependencies`). Szczegóły i uzasadnienie w
  „Podejście” pkt 2.
- **Breakpoint shellu:** `md` (768px) — Sidebar ↔ BottomNav.
- **Zakres kart w Portfelu:** wszystkie 5 tabel (Pozycje, Transakcje, Podsumowanie roczne PIT-38,
  Zrealizowane sprzedaże, Dywidendy) dostają widok kartowy na mobile — pełna spójność UX, bez
  wyjątków z poziomym scrollem.
- **Kolory monogramu:** tło accent `#3987e5` + białe litery „ID”; `theme_color`/`background_color`
  manifestu pozostają dopasowane do UI aplikacji (`#0d0d0d`, ciemny motyw), niezależnie od kolorów
  samej ikony.
- **Estetyka liter:** prosty geometryczny monogram (`<path>`/`<rect>`, bez fontów) — bez `next/og`.
- **`themeColor` per motyw:** best-effort przez `prefers-color-scheme` (statyczny `viewport` export,
  bez dynamic renderingu); możliwy kosmetyczny rozjazd z ręcznie wybranym motywem — zaakceptowane.
- **Zawartość „Więcej”:** oprócz Research/Ustawienia i `ThemeToggle` — także stopka informacyjna
  „Notowania: Yahoo Finance… / Kursy walut: NBP” (parytet z Sidebarem), na stałe (nie opcjonalnie).

## Wymagania

- Plik manifestu obsługiwany natywnie przez Next 16 (`app/manifest.ts`), z `name`, `short_name`,
  `description`, `start_url: "/"`, `display: "standalone"`, kolorami dopasowanymi do ciemnego
  motywu domyślnego oraz tablicą ikon (192, 512, maskable).
- Ikony PWA wygenerowane programowo i **zacommitowane** jako statyczne pliki (build ich nie
  odtwarza automatycznie).
- Poprawny `viewport`/`themeColor` w root layoucie (osobny eksport `viewport`, nie w `metadata` —
  wymóg aktualnej wersji Next).
- Na ekranach `< md` (768 px): dolny pasek nawigacji (4 pozycje + „Więcej”), `Sidebar` ukryty.
- Na ekranach `≥ md`: dotychczasowy `Sidebar`, dolny pasek ukryty. Desktop bez regresji.
- Tabele portfela/watchlisty czytelne na telefonie (karty zamiast poziomego scrolla).
- Brak poziomego scrolla całej strony na 360 px na żadnej podstronie.
- Motyw jasny/ciemny osiągalny również na mobile (dziś przełącznik `ThemeToggle` żyje w
  `Sidebar`, który na mobile jest ukryty — musi trafić do „Więcej”).
- `npm run lint` i `npm run build` przechodzą.

## Zakres i Non-goals

**W zakresie:**
- `app/manifest.ts` + wygenerowane ikony (`public/icon-*.png`, `app/apple-icon.png`, `app/icon.svg`)
  + skrypt generujący.
- `viewport`/`themeColor`/`viewportFit` w `src/app/layout.tsx`.
- Nowy `BottomNav` (dolna nawigacja + bottom sheet „Więcej” z Research/Ustawienia + `ThemeToggle`).
- Wydzielenie współdzielonych danych nawigacji do jednego modułu (`src/components/nav.ts`),
  reużytego przez `Sidebar` i `BottomNav`.
- Responsywna przebudowa: tabele → karty na `< md` (portfolio, watchlist, transakcje na
  companies/[id]); drobne poprawki filtra newsów, nagłówka spółki i paddingu `main`.
- Weryfikacja pozostałych stron (research, settings, dashboard) — potwierdzone jako już
  responsywne, ewentualne mikro-poprawki.

**Non-goals (świadomie pomijamy):**
- Service worker (`public/sw.js`), cache offline, background sync, `next dev --experimental-https`.
- Push notifications, klucze VAPID, `app/actions.ts`, `web-push`.
- Własny przycisk instalacji (`beforeinstallprompt`) i dedykowany komunikat instalacji dla iOS —
  polegamy na natywnym „Add to Home Screen” przeglądarki (por. dokumentacja Next: prompt pojawia
  się sam, gdy jest ważny manifest + HTTPS).
- Nagłówki bezpieczeństwa z przewodnika PWA (`X-Frame-Options` itd.) — poza zakresem tego featurea
  (dotyczą głównie SW; ewentualnie osobne zadanie).
- Przeprojektowanie desktopu — desktop zostaje bez zmian wizualnych.
- Zmiana bibliotek wykresów / packaging do sklepów.

## Podejście

> Reguła z `AGENTS.md` — API Next.js zweryfikowane w `node_modules/next/dist/docs/` (Next
> **16.2.10**):
> - `01-app/02-guides/progressive-web-apps.md` — natywny przewodnik PWA: manifest przez
>   `app/manifest.ts|json`, install prompt bez SW, SW/push są opcjonalne (i u nas poza zakresem).
> - `01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md` — `app/manifest.ts`
>   zwraca `MetadataRoute.Manifest`; jest **statyczny/cache’owany** (serwowany pod
>   `/manifest.webmanifest`, `<link rel="manifest">` wstrzykiwany automatycznie z samej obecności
>   pliku — bez ruszania `metadata`).
> - `01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md` — statyczne pliki
>   `app/icon.(svg|png|ico)` i `app/apple-icon.png` są automatycznie linkowane w `<head>`; można też
>   generować ikony kodem przez `ImageResponse` z `next/og`. **`favicon` nie da się wygenerować
>   kodem — tylko `icon`/`apple-icon`.** SVG dostaje `sizes="any"`.
> - `01-app/03-api-reference/04-functions/generate-viewport.md` — `themeColor`, `colorScheme`,
>   `viewportFit`, `width` idą przez **osobny eksport `viewport: Viewport`** (NIE przez `metadata`,
>   jak w starszym Next); `viewport` jest wspierany **tylko w Server Components** (nasz root layout
>   nim jest). Domyślny `<meta name="viewport" content="width=device-width, initial-scale=1">`
>   Next ustawia sam — ręcznie dokładamy głównie `themeColor`.

**Zaskoczenia względem wiedzy treningowej (starszy Next):** (a) `themeColor` przeniesiono z
`metadata` do osobnego eksportu `viewport` — wstawienie go do `metadata` w Next 16 daje ostrzeżenie
i jest ignorowane; (b) Next ma **wbudowany, udokumentowany przewodnik PWA** i konwencję
`app/manifest.ts` z typem `MetadataRoute.Manifest` — nie trzeba ręcznie pisać `<link rel="manifest">`
ani wrzucać `manifest.json` do `public/`.

### 1. Instalowalność — manifest + viewport (bez SW)

`app/manifest.ts` zwraca statyczny obiekt `MetadataRoute.Manifest`. Kolory z ciemnej palety
(baza aplikacji, `globals.css`): `background_color` i `theme_color` = `#0d0d0d` (`--color-bg` dark).
`display: "standalone"`, `start_url: "/"`, `lang: "pl"`, `dir: "ltr"`. Ikony (patrz pkt 2)
referowane URL-em z `public/`.

`viewport` w `layout.tsx` (osobny eksport): `themeColor` best-effort przez `prefers-color-scheme`
(light `#ffffff`, dark `#0d0d0d`) + `viewportFit: "cover"` (żeby dolny pasek mógł respektować
`env(safe-area-inset-bottom)` na iPhone z home-indicatorem). Świadome ograniczenie: motyw
aplikacji jest sterowany atrybutem `data-theme` (ciasteczko), **nie** `prefers-color-scheme`
(por. komentarz w `AllocationDonut.tsx`), więc kolor paska UI przeglądarki może chwilowo nie
zgadzać się z ręcznie wybranym motywem — to wyłącznie kosmetyka chrome’u systemowego, nie treści
(szczegóły w Ryzykach; ewentualne dynamiczne `themeColor` per-ciasteczko to opcja w Pytaniach).

### 2. Ikony — programowy monogram „ID”, statyczne PNG przez `sharp`

Wybór: **skrypt Node `scripts/generate-pwa-icons.mjs` rasteryzujący `sharp`-em jeden „master”
SVG do statycznych PNG-ów**, commitowanych do repo. `sharp` jest już w `dependencies` (`^0.35.3`)
— zero nowych zależności.

Kluczowa decyzja techniczna: **litery „ID” rysujemy jako wektorowe `<path>`/`<rect>` w SVG, nie
jako `<text>`.** Powód: rasteryzacja `<text>` w `sharp` (libvips/librsvg) zależy od dostępnych w
systemie fontów (fontconfig) — to notorycznie zawodzi headless i cross-platform (Windows/Docker).
Kształty wektorowe renderują się deterministycznie, bez fontów. „I” = prostokąt, „D” = `path`
(pionowa belka + półokrągły łuk) — proste do zapisania ręcznie w skrypcie. Dzięki temu skrypt jest
w pełni powtarzalny w każdym środowisku.

Skrypt (jeden „master” SVG budowany w JS: zaokrąglony kwadrat w `--color-accent` `#3987e5` +
białe litery „ID”) produkuje:
- `public/icon-192.png` (192×192, `purpose: "any"`),
- `public/icon-512.png` (512×512, `purpose: "any"`),
- `public/icon-maskable-512.png` (512×512, `purpose: "maskable"` — tło **na full-bleed**, bez
  zaokrągleń i bez przezroczystości, monogram w bezpiecznej strefie ~60% środka, bo Android
  nakłada własną maskę),
- `src/app/apple-icon.png` (180×180, pełne tło — iOS ignoruje alpha i sam zaokrągla),
- `src/app/icon.svg` (ten sam master jako ostry favicon karty w nowoczesnych przeglądarkach; Next
  linkuje go automatycznie, `sizes="any"`).

`src/app/favicon.ico` zostaje jako legacy-fallback (nie ruszamy). Skrypt dopisujemy do
`package.json` jako `"icons": "node scripts/generate-pwa-icons.mjs"`; uruchamiamy raz, wynik
commitujemy (assety statyczne, jak dziś `favicon.ico` / `public/*.svg`).

_Rozważona alternatywa (odrzucona jako główna):_ generowanie ikon przez `app/icon.tsx` /
`app/apple-icon.tsx` z `ImageResponse` (`next/og`). Zaleta: niezawodny render **tekstu** (next/og
ma wbudowany font, więc „ID” jako `<text>` zadziała bez fontconfig). Wada: `ImageResponse` żyje w
route handlerze i produkuje URL-e typu `/icon?<hash>`, których **manifest** (osobny plik) nie
referuje wygodnie — dla ikon instalacyjnych 192/512/maskable i tak potrzebujemy stabilnych,
statycznych URL-i w `public/`. Trzymanie dwóch mechanizmów (route dla karty + statyki dla
manifestu) jest mniej spójne niż jeden master SVG → wszystkie rozmiary. Zostawiamy jako plan B,
gdyby ręczne ścieżki liter okazały się niewystarczające estetycznie (patrz Pytania).

_Rozważona alternatywa (odrzucona):_ SVG bezpośrednio jako ikona instalacyjna w `manifest.icons`.
Android/Chrome to wspiera od ~2021, ale iOS/Safari i starsze Androidy — nie; dla „Add to Home
Screen” PNG 192/512 jest bezpiecznym, przenośnym minimum. SVG używamy tylko jako favicon karty.

### 3. Responsywny shell — Sidebar `md:` / BottomNav

Breakpoint podziału: **`md` (768 px)**. Poniżej — dolny pasek; od `md` w górę — sidebar (208 px
mieści się wygodnie na tabletach). Współgra z Tailwindem (istniejący kod używa `lg:`/`xl:` do
siatek treści; `md:` do „szkieletu” to naturalne uzupełnienie). Wybór do potwierdzenia w Pytaniach.

- `Sidebar` (`components/Sidebar.tsx`) dostaje `hidden md:flex` na `<aside>` — znika na mobile,
  bez zmian od `md`.
- Nowy `BottomNav` (`components/BottomNav.tsx`, `"use client"`): `fixed inset-x-0 bottom-0 z-40
  md:hidden`, `border-t border-border bg-surface`, `pb-[env(safe-area-inset-bottom)]`. Pięć slotów
  w `grid grid-cols-5`: 4 linki (Dashboard, Portfel, Watchlista, Newsy) + przycisk „Więcej”.
  Ikona (te same znaki co w `NAV`) nad krótką etykietą, `text-[10px]`. Stan aktywny liczony jak w
  `Sidebar` (`pathname === "/"` dla dashboardu, `pathname.startsWith(href)` dla reszty); „Więcej”
  podświetlone, gdy `pathname` zaczyna się od `/research` lub `/settings`.
- **Reużycie danych nawigacji:** dziś `NAV` jest zaszyte w `Sidebar.tsx`. Wydzielamy je do
  `src/components/nav.ts` (zwykły moduł danych, bez `"use client"`) jako `NAV` (pełna szóstka) +
  pochodne `PRIMARY_NAV` (4) i `SECONDARY_NAV` (Research, Ustawienia). `Sidebar` i `BottomNav`
  importują to samo źródło prawdy — brak duplikacji, brak nowej abstrakcji ponad potrzebę.

**UX przycisku „Więcej” — bottom sheet.** Kliknięcie otwiera panel wysuwany od dołu (nad paskiem),
ze scrimem `fixed inset-0 z-50 bg-black/60` przyciemniającym resztę. Panel: `fixed inset-x-0
bottom-0 z-50 rounded-t-2xl border-t border-border bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]`,
wjazd `translate-y` z własną `transition: transform .2s ease` (globalna reguła w `globals.css`
animuje tylko `background/border/color`, więc transform trzeba dołożyć lokalnie). Zawartość:
- pozycje `SECONDARY_NAV` (Research, Ustawienia) jako duże, dotykowe wiersze (min. ~44 px wysokości);
- separator;
- `ThemeToggle` (przeniesiony zasięgowo — na mobile to jedyna droga do zmiany motywu, bo sidebar
  ukryty);
- stopka „Notowania: Yahoo Finance (~15 min opóźnienia) / Kursy walut: NBP” (ta sama treść co dziś
  w stopce `Sidebar`), dla pełnego parytetu informacji z desktopem.

Zamykanie: tap w scrim, `Escape`, oraz **automatycznie po nawigacji** (zmiana `pathname` zamyka
sheet — inaczej zostałby otwarty nad nową stroną). Wzorzec `Escape` + `body.style.overflow =
"hidden"` kopiujemy z istniejącego `components/Modal.tsx` (ta sama mechanika blokady scrolla i
klawisza) — bez tworzenia nowej biblioteki modali; sheet jest na tyle specyficzny (kotwiczenie do
dołu, brak nagłówka), że robimy go lokalnie w `BottomNav`, ale zgodnie z konwencją `Modal`.

**Layout.** W `src/app/layout.tsx`:
- `<BottomNav />` renderowany **wewnątrz** `<ThemeProvider>` (sheet hostuje `ThemeToggle` →
  potrzebuje kontekstu motywu), jako rodzeństwo `<div className="flex …">`.
- `<main>` dostaje dolny padding na mobile, żeby treść nie chowała się pod paskiem, oraz węższy
  padding boczny na telefonie: `px-4 py-5 pb-24 md:px-6 md:py-6 md:pb-6 lg:px-8` (dziś:
  `px-6 py-6 lg:px-8`).
- `min-w-0 flex-1` na `<main>` zostaje (chroni przed rozpychaniem szerokości przez tabele).

### 4. Tabele → karty na mobile

Wzorzec dla każdej przebudowywanej tabeli: **jeden render tabeli owinięty `hidden md:block`
(desktop bez zmian) + równoległy render kart `md:hidden` (mobile)**, oba karmione z tej samej,
raz zmapowanej listy w tym samym pliku (minimalizuje ryzyko rozjazdu danych). Karta = mały blok
`rounded-lg border border-border bg-surface p-3`: nagłówek (najważniejsza etykieta + kluczowa
wartość/`Delta`), pod spodem `grid grid-cols-2 gap-x-3 gap-y-1` par „etykieta / wartość”
(`text-[11px] text-muted` / `text-[13px]`), a na końcu ewentualny rząd akcji.

Reużywamy istniejące klocki z `components/ui.tsx`: `Delta`, `Badge`, `EmptyState`, formatery z
`lib/format` (`fmtMoney`, `fmtNumber`, `fmtQty`, `fmtDate`, `fmtPct`). Opcjonalnie dodajemy do
`ui.tsx` lekki, współdzielony helper renderujący parę „label/value” (np. `Field`), żeby nie
powielać markupu — jeśli po pierwszej implementacji widać powtórzenie; nie tworzymy go „na zapas”.

## Pliki do zmiany

### PWA: manifest, viewport, ikony

- `src/app/manifest.ts` — **nowy**. `export default function manifest(): MetadataRoute.Manifest`
  (import typu z `next`). Pola: `name: "Invest Dashboard"`, `short_name: "Invest"`,
  `description` (jak `metadata.description`: „Prywatny dashboard inwestycyjny”),
  `start_url: "/"`, `display: "standalone"`, `background_color: "#0d0d0d"`,
  `theme_color: "#0d0d0d"`, `lang: "pl"`, `dir: "ltr"`, `icons` → trzy wpisy jak w pkt 2. Plik jest
  statyczny (bez request-time API), więc pozostaje cache’owany; `<link rel="manifest">` wstrzyknie
  się sam — `metadata` w `layout.tsx` **nie** wymaga edycji pod manifest.
- `src/app/layout.tsx` — dodać:
  ```ts
  import type { Viewport } from "next";
  export const viewport: Viewport = {
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
    ],
    viewportFit: "cover",
  };
  ```
  Osadzić `<BottomNav />` w drzewie `<ThemeProvider>`; zmienić klasy `<main>` (padding jw.).
  `metadata` (title/description) — bez zmian.
- `scripts/generate-pwa-icons.mjs` — **nowy**. Buduje master SVG (accent bg + „ID” jako paths),
  `sharp(Buffer.from(svg)).resize(...).png().toFile(...)` dla każdego rozmiaru/wariantu; osobny
  wariant maskable (full-bleed). Zapisuje do `public/` i `src/app/`. Idempotentny.
- `package.json` — dodać skrypt `"icons": "node scripts/generate-pwa-icons.mjs"` (`sharp` już jest).
- **Wygenerowane, commitowane assety:** `public/icon-192.png`, `public/icon-512.png`,
  `public/icon-maskable-512.png`, `src/app/apple-icon.png`, `src/app/icon.svg`. `src/app/favicon.ico`
  — bez zmian.

### Nawigacja / shell

- `src/components/nav.ts` — **nowy**. Eksport `NAV` (dzisiejsza tablica z `Sidebar.tsx`: `{ href,
  label, icon }` × 6), plus `PRIMARY_NAV` = `["/", "/portfolio", "/watchlist", "/news"]` (lub
  4 pierwsze elementy `NAV`) i `SECONDARY_NAV` = pozostałe (Research, Ustawienia). Zwykły moduł
  (bez `"use client"`), importowalny po obu stronach.
- `src/components/Sidebar.tsx` — usunąć lokalną `NAV`, importować z `nav.ts`; dodać `hidden md:flex`
  do `<aside>`. Reszta (ThemeToggle w stopce, styl aktywnej pozycji) bez zmian.
- `src/components/BottomNav.tsx` — **nowy** (`"use client"`, `usePathname`). Pasek `md:hidden` +
  bottom sheet „Więcej” (Research/Ustawienia + `ThemeToggle`). Reużyj `Link` (next), `ThemeToggle`,
  mechanikę Escape/scroll-lock z `Modal.tsx`. Sheet zamykany też na zmianę `pathname`.

### Strony — inwentaryzacja i przebudowa pod mobile

- **`src/app/page.tsx` (Dashboard `/`)** — *w większości już responsywna.* StatTile w
  `grid-cols-2 xl:grid-cols-4` (2 kolumny na mobile — OK), wykresy w `grid-cols-1 xl:grid-cols-5`
  (stackują się do pełnej szerokości), `AreaChart`/`BenchmarkChart` mają `autoSize`/`w-full`,
  `AllocationDonut` jest `flex flex-wrap` (donut nad legendą). Lista „Ostatnie newsy” to responsywny
  flex. **Zmiany:** brak strukturalnych; ewentualnie zweryfikować, że wartość w `StatTile`
  (`text-xl`) nie łamie się brzydko przy 2 kolumnach na ~360 px (w razie czego `text-lg` na mobile).
- **`src/app/portfolio/page.tsx` (Portfel)** — *główna praca tabele→karty.* Pięć tabel przez
  `<Table>` (poziomy scroll na mobile). Przebudowa:
  - **Pozycje** (8 kol.) → karty: nagłówek = ticker (link do `/companies/[id]`) + `Delta` „Wynik
    PLN”; pola: Ilość (`fmtQty`), Śr. koszt, Kurs, Dziś (`Delta pct`), Wartość PLN (`fmtMoney`).
    Nazwa spółki (dziś `hidden lg:inline`) w karcie pod tickerem.
  - **Transakcje** (`allTx`) → karty: data + ticker + `Badge` typu; Ilość/Cena/Prowizja; rząd akcji
    (`TransactionEditButton` + `DeleteButton`).
  - **Podsumowanie roczne (PIT-38)**, **Zrealizowane sprzedaże (FIFO)**, **Dywidendy** → karty per
    wiersz (rok / sprzedaż / dywidenda) z listą par label/value — pełna spójność, wszystkie pięć
    tabel Portfela dostaje widok kartowy na mobile (decyzja użytkownika, bez wyjątków).
  - Nagłówek strony ma 4 przyciski akcji; `PageHeader` już jest `flex-wrap`, więc zawijają się na
    mobile (akceptowalne).
- **`src/app/watchlist/page.tsx` (Watchlista)** — jedna tabela (8 kol.) → karty: `WatchlistToggle`
  + ticker (link) + nazwa; `Badge` rynek/typ; Kurs + `Delta` „Dziś”; badge nieprzeczytanych newsów;
  „Aktualizacja”. Desktopowa `<Table>` w `hidden md:block`.
- **`src/app/news/page.tsx` (Newsy)** — lista `NewsInfiniteList` jest responsywna (tytuł + przycisk
  toggle, `flex-wrap` na metadanych). **Zmiana punktowa w `NewsFilter`** (niżej). Poza tym bez zmian.
- **`src/app/research/page.tsx` (Research — lista)** — responsywna lista notatek (tytuł + `Badge` +
  snippet + data). **Bez zmian.**
- **`src/app/research/new/page.tsx` (Nowa notatka)** — renderuje `NoteEditor` w `Card`. `NoteEditor`
  ma już `grid-cols-1 sm:grid-cols-[1fr_240px]` i `flex-wrap` na pasku narzędzi; textarea pełnej
  szerokości. **Bez zmian** (zweryfikować tylko zawijanie przycisków paska na ~360 px).
- **`src/app/research/[id]/page.tsx` (Notatka)** — `PageHeader` + `NoteEditor` (jw.). **Bez zmian.**
- **`src/app/settings/page.tsx` (Ustawienia)** — `space-y-4` stack `Card`; `AiSettingsForm` i
  `ScheduleSettingsForm` są `max-w-xl space-y-3`, jednokolumnowe, `Input` pełnej szerokości;
  `SourcesManager` ma formularz `grid-cols-1 sm:grid-cols-2` i listę `flex` z `truncate` URL.
  **Bez zmian** (już responsywne).
- **`src/app/companies/[id]/page.tsx` (Spółka)** — *drobne + tabela→karty.*
  - Sub-nagłówek `PageHeader.sub` to `inline-flex` z kilkoma `Badge` — dodać `flex-wrap`, żeby na
    wąsko badge’e się zawijały, nie rozpychały.
  - StatTile `grid-cols-2 xl:grid-cols-4` — OK (2 kol. mobile).
  - `PriceChart` (autofit) — OK, pełna szerokość.
  - Siatka `grid-cols-1 xl:grid-cols-2` stackuje się na mobile — OK.
  - **Transakcje spółki** (5 kol.) → karty (ten sam wzorzec co w portfelu; można wydzielić wspólny
    render karty transakcji, jeśli nie rozdmucha to plików).
  - `AiChat` (`flex items-end gap-2`, textarea + przycisk) — OK na mobile.

### Punktowe poprawki komponentów

- `src/components/NewsFilter.tsx` — dziś `flex items-center gap-2` z `Select` `w-56` + 2 checkboxy;
  na ~360 px się nie mieści. Zmienić na `flex flex-wrap` i `Select` `w-full sm:w-56`, checkboxy pod
  spodem gdy brak miejsca. Reużyj istniejący `Select` z `ui.tsx`.
- `src/components/ui.tsx` — *opcjonalnie* dodać drobny helper `Field({label, children})` (para
  label/value) do kart mobilnych, jeśli po implementacji widać powtarzalny markup. Nie dodawać
  „na zapas”.

## Kryteria akceptacji

- [ ] Na `< md` widoczny dolny pasek z 4 pozycjami + „Więcej”; `Sidebar` ukryty. Na `≥ md` odwrotnie.
- [ ] „Więcej” otwiera bottom sheet z Research, Ustawienia oraz `ThemeToggle`; nawigacja działa,
      sheet zamyka się po wyborze pozycji, na `Escape` i na tap w scrim.
- [ ] Motyw jasny/ciemny da się przełączyć na telefonie (przez „Więcej”), a zmiana działa jak dziś.
- [ ] Na mobile tabele Pozycje/Transakcje (portfolio), tabela watchlisty i transakcje na
      `companies/[id]` renderują się jako karty; na desktopie wyglądają identycznie jak dziś.
- [ ] Żadna podstrona nie ma poziomego scrolla całej strony na 360 px
      (`document.documentElement.scrollWidth <= clientWidth`).
- [ ] `/manifest.webmanifest` zwraca poprawny JSON (`display: "standalone"`, `theme_color`,
      trzy ikony); w `<head>` jest `<link rel="manifest">`; ikony 192/512/maskable ładują się (200).
- [ ] DevTools → Application → Manifest: brak błędów instalowalności; w Chrome pojawia się
      „Install app” / na Androidzie „Add to Home Screen”; ikona na ekranie głównym to monogram „ID”.
- [ ] Karta przeglądarki pokazuje ikonę „ID” (z `app/icon.svg`), a nie domyślną.
- [ ] `npm run lint` i `npm run build` przechodzą; skrypt `npm run icons` generuje 5 assetów bez
      błędów w czystym środowisku (Windows i Docker/Linux).
- [ ] Desktop bez regresji wizualnej.

## Ryzyka

- **`sharp` + tekst SVG (fonty).** Rasteryzacja `<text>` zależy od fontconfig i psuje się headless/
  cross-platform. Mityguje rysowanie „ID” jako `<path>`/`<rect>` (bez fontów) — deterministyczne.
- **`output: "standalone"` a `public/`.** `next.config.ts` ma `output: "standalone"`. W trybie
  standalone Next **nie kopiuje** automatycznie `public/` ani `.next/static` do `.next/standalone`
  — muszą być dostarczone obok serwera. Repo już serwuje `public/*.svg`, więc deployment (Coolify/
  Dockerfile) najpewniej to obsługuje, ale **trzeba potwierdzić**, że `public/icon-*.png` faktycznie
  serwują się na produkcji (inaczej manifest wskaże 404 i instalowalność padnie).
- **`themeColor` vs `data-theme`.** Motyw jest sterowany ciasteczkiem/`data-theme`, nie
  `prefers-color-scheme`; kolor paska UI przeglądarki (z `viewport.themeColor` opartego na media)
  może nie zgadzać się z ręcznym wyborem motywu. To kosmetyka chrome’u systemowego. Alternatywa
  (dynamiczne `generateViewport` czytające ciasteczko) opt-inuje layout do dynamic renderingu i
  komplikuje shell — świadomie pomijamy (patrz Pytania).
- **Duplikacja tabela/karty.** Dwa rendery z jednej listy mogą się rozjechać przy zmianach.
  Mityguje trzymanie obu w jednym pliku z jednego `.map`, ewentualnie wspólny helper `Field`.
- **z-index / nakładanie.** Bottom sheet i scrim (`z-50`) muszą być nad paskiem (`z-40`); istniejące
  `Modal` (`z-50`) powinny zakrywać pasek — zweryfikować, że modale formularzy (Transakcja,
  Dywidenda, Spółka) otwierane z mobile nie chowają się pod paskiem/za sheetem.
- **Bezpieczna strefa iOS.** Bez `viewportFit: "cover"` + `env(safe-area-inset-bottom)` dolny pasek
  wchodziłby pod home-indicator. Dodane w planie; przetestować na realnym iPhonie/symulatorze
  (DevTools nie zawsze oddaje `env()`).
- **Globalna reguła `transition` z `globals.css`** obejmuje tylko `background/border/color` — wjazd
  sheetu (`transform`) wymaga własnej `transition`, inaczej „skacze”.
- **`favicon` nie da się wygenerować kodem** (dok. Next) — dlatego favicon karty robimy przez
  statyczny `app/icon.svg`, a stary `favicon.ico` zostaje jako fallback.

## Pytania do doprecyzowania

Brak otwartych pytań — wszystkie sześć decyzji z pierwszej wersji planu zostało rozstrzygniętych
z użytkownikiem w drugiej rundzie i wpisanych do sekcji „Ustalenia” oraz odpowiednich miejsc w
„Podejście” / „Pliki do zmiany” powyżej.
