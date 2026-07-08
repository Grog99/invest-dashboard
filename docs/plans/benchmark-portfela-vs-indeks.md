# Benchmark portfela vs indeks / ETF

> Plan wygenerowany przez skill `/plan-feature`. Slug: `benchmark-portfela-vs-indeks`. Branch: `claude/punkt-2-4-index-handling-246d21` (dedykowany worktree tego zadania, świeży z `main` — nie tworzymy dodatkowego `feature/*`).

## Kontekst / Problem

Punkt 2.4 z `context/roadmap.md` („Benchmark vs WIG / S&P 500"). Chcemy na
dashboardzie widzieć **czy aktywna selekcja spółek bije prosty benchmark** (indeks
albo ETF) — druga seria na wykresie wartości portfela, znormalizowana do 100 na
początku zakresu.

**Uwaga: opis w roadmapie jest częściowo nieaktualny.** Powstał przed commitem
`98e49fd` („obsługa typu instrumentu ETF/Indeks", plan:
`docs/plans/obsluga-etf-indeksy.md`), który **już zbudował** mechanizm, jaki
roadmapa proponowała pisać od zera:

- Istnieje kolumna `companies.type` (`STOCK | ETF | INDEX`, stała
  `INSTRUMENT_TYPES` w `src/db/schema.ts:11`).
- INDEX jest „watch-only": ma notowania w `quotes_daily` / `quotes_latest`
  (wykres działa), ale `computePortfolio()` pomija go
  (`src/lib/portfolio.ts:118` — `if (company.type === "INDEX") continue;`), więc
  nie tworzy pozycji, nie wchodzi do PIT/alokacji/dashboardu.
- Użytkownik **już dodaje** indeksy i ETF-y jako zwykłe spółki na watchliście
  przez istniejący `CompanyForm` (`src/components/CompanyForm.tsx`), z sugestią
  symbolu Yahoo per typ (`suggestQuoteSymbol` w `src/lib/yahoo.ts:111`).

Dlatego **nie tworzymy** tabeli `benchmarks` ani „pseudo-spółek" z
`market='OTHER'`. Źródłem benchmarków są już istniejące wiersze `companies` z
`type IN ('INDEX','ETF')` i `watchlist=1`. Ograniczenie danych Yahoo
(zweryfikowane w planie ETF): `WIG20.WA` nie ma historii → do ekspozycji na WIG20
używa się ETF `ETFBW20TR.WA`; za to `WIG.WA` (INDEX) i `^GSPC` (INDEX) mają pełną
historię. W praktyce benchmarki to więc **mieszanka INDEX + ETF** dodanych ręcznie
przez użytkownika. To zadanie dokłada wyłącznie **UI/logikę porównania**.

## Wymagania

- Na dashboardzie (`src/app/page.tsx`), w karcie „Wartość portfela", selektor
  benchmarku: dropdown zbudowany z istniejących spółek watchlisty z
  `type IN ('INDEX','ETF')` + opcja „Brak (bez benchmarku)".
- Po wybraniu benchmarku wykres pokazuje **dwie serie linii**: portfel i benchmark,
  **każda niezależnie znormalizowana do 100** na pierwszej wspólnej dacie widocznego
  zakresu (365 dni). Bez przeliczania benchmarku na PLN — czyste, currency-blind
  porównanie stopy zwrotu (decyzja użytkownika #3).
- Gdy benchmark nie jest wybrany — wykres działa jak dziś (`AreaChart`, wartość
  portfela w PLN, jedna seria, oś w złotówkach).
- Wybór benchmarku jest **zapamiętywany** w tabeli `settings` pod kluczem
  `dashboard_benchmark_company_id` i wraca przy kolejnej wizycie (decyzja #4).
- Gdy użytkownik nie ma żadnej spółki `INDEX`/`ETF` na watchliście — zamiast
  selektora pusty stan / CTA kierujące na Watchlistę (decyzja #1).
- Obie serie muszą respektować motyw jasny/ciemny tak jak istniejące wykresy
  (kolory z `useThemeColors()`), z dwoma **różnymi** kolorami serii + legendą
  (lightweight-charts nie ma wbudowanej legendy).

## Zakres i Non-goals

**W zakresie:**
- Nowy komponent wykresu `src/components/charts/BenchmarkChart.tsx` (dwie
  `LineSeries` na wspólnej skali, znormalizowane do 100, legenda, theme-aware).
- Logika serwerowa w `src/lib/portfolio.ts`: pobranie historii benchmarku dla
  jednej spółki + normalizacja obu serii do wspólnej bazy 100.
- Klucz `settings` + rozszerzenie `POST /api/settings` o zapis wyboru.
- Klient-selektor `src/components/BenchmarkSelect.tsx` (auto-submit + `router.refresh()`).
- Podpięcie w dashboardzie: selektor w nagłówku karty, przełączanie
  `AreaChart` ↔ `BenchmarkChart` zależnie od wyboru, opcjonalny wskaźnik różnicy
  stóp zwrotu, pusty stan/CTA.

**Non-goals (świadomie pomijamy):**
- Osobna sekcja porównania na `/portfolio` (decyzja #2 — tylko dashboard).
- Przeliczanie benchmarku na PLN / porównanie w walucie (decyzja #3).
- TWR (2.3) — normalizacja do 100 to prosta stopa zwrotu punkt-do-punktu, nie
  time-weighted return. To akceptowalne dla „nakładki na wykres" (patrz
  zależności roadmapy: sama nakładka nie wymaga TWR).
- Przełącznik zakresu (3M/1R/3L/MAX) na wykresie dashboardu — dziś dashboard ma
  sztywne 365 dni; nie dokładamy tego (patrz Ryzyka — ruchomy zakres komplikuje
  bazę normalizacji).
- Wiele benchmarków naraz / porównanie kilku indeksów — jeden benchmark.
- Auto-dodawanie presetów (WIG/S&P) w tle (decyzja #1 — tylko istniejące wiersze).

## Podejście

**Jedno źródło prawdy, minimalna addytywna zmiana** — spójnie z konwencją repo i
z poprzednim planem (`suggestQuoteSymbol` scalony w jednym miejscu). Kluczowe
decyzje architektoniczne:

1. **Nowy komponent wykresu, nie rozszerzanie `AreaChart.tsx`.** `AreaChart.tsx`
   jest współdzielony (dashboard + `PriceChart`) i celowo prosty (jedna
   `AreaSeries`); w repo istnieje już precedens rozdzielenia — `CandleChart.tsx`
   ma komentarz: *„celowo osobny komponent, bo AreaChart.tsx jest współdzielony z
   dashboardem i nie może się zmienić"*. Idziemy tą samą drogą: nowy
   `BenchmarkChart.tsx` z tą samą strukturą dwóch `useEffect` (montaż/cleanup +
   dane/cleanup serii), ale rysujący **dwie `LineSeries`** (nie `AreaSeries` —
   dwa wypełnione obszary nałożone na siebie byłyby nieczytelne). Obie serie na
   **domyślnej, wspólnej prawej skali cen** (bez `priceScaleId` → obie trafiają
   na tę samą oś; ma to sens, bo obie są znormalizowane do 100). `LineSeries` jest
   eksportowane w `lightweight-charts` 5.2.0 (potwierdzone: `lineSeries as
   LineSeries`), tak jak używane już `CandlestickSeries`/`HistogramSeries`.

2. **Selektor przełącza „tryb" wykresu.** Gdy benchmark = brak → renderujemy
   dzisiejszy `AreaChart` (PLN, oś w złotówkach). Gdy benchmark wybrany →
   renderujemy `BenchmarkChart` (obie serie w skali 0–100+, bo normalizacja
   zmienia znaczenie osi Y z PLN na „indeks=100"; nie da się pokazać PLN i
   benchmarku na jednej osi). Decyzję o trybie podejmuje **server component**
   (`page.tsx`) na podstawie odczytanego ustawienia.

3. **Normalizacja liczona po stronie serwera** (single source of truth, czyste
   funkcje do przetestowania), a `BenchmarkChart` dostaje gotowe, znormalizowane
   `{ time, value }[]` dla obu serii i jest „głupim" komponentem rysującym. Baza
   normalizacji = pierwsza **wspólna** data obu serii w oknie 365 dni (portfel ma
   dane dopiero od pierwszej transakcji — `portfolioValueHistory` zwraca `[]` gdy
   brak transakcji; benchmark ma zwykle dłuższą historię). Algorytm w „Pliki do
   zmiany".

4. **Persystencja i przełączanie — Route Handler + `router.refresh()`, NIE Server
   Action.** Sprawdzono `node_modules/next/dist/docs/01-app/01-getting-started/
   15-route-handlers.md` oraz `.../02-guides/server-actions.md`. Repo konsekwentnie
   używa Route Handlerów + `fetch()` + `router.refresh()` z `next/navigation`
   (np. `WatchlistToggle.tsx:18-24`, `CompanyForm.tsx:68-83`,
   `ThemeProvider.tsx:42`) — **nie** Server Actions. Trzymamy się tej konwencji:
   `BenchmarkSelect` (client) na `onChange` POST-uje wybór do
   **istniejącego** `POST /api/settings` (reużycie `setSetting`), po czym woła
   `router.refresh()` — server component re-renderuje kartę z nową serią
   benchmarku. Dzięki `router.refresh()` cała logika serii zostaje na serwerze
   (bez osobnego GET-API do pobierania serii benchmarku po stronie klienta).
   Dashboard pozostaje server componentem z `export const dynamic = "force-dynamic"`
   — bez zmiany modelu renderowania.

Odrzucone alternatywy (jednozdaniowo): (a) rozszerzenie `AreaChart` o opcjonalną
drugą serię — łamie konwencję „AreaChart się nie zmienia" i komplikuje wspólny
komponent; (b) klient pobiera serię benchmarku z nowego `GET /api/benchmark` i
podmienia serie bez `router.refresh` — dubluje miejsce liczenia serii i i tak
wymaga POST do zapamiętania wyboru; (c) osobna tabela `benchmarks` /
pseudo-spółki — zbędne, mechanizm INDEX/ETF już istnieje.

## Pliki do zmiany

### Logika serwerowa

- **`src/lib/portfolio.ts`** — dwie nowe czyste funkcje obok
  `portfolioValueHistory` (linia 320), reużywające jej wzorca zapytań:
  - `benchmarkCloseHistory(companyId: number, days = 365): { date: string; close: number }[]`
    — `SELECT date, close FROM quotes_daily WHERE company_id = ? AND date >= startISO
    ORDER BY date ASC`. To jest brakujący odpowiednik „historii jednej spółki";
    **nie istnieje dziś** (strona instrumentu robi analogiczny `SELECT` inline,
    `src/app/companies/[id]/page.tsx:73-90` — inny kształt/zakres, nie reużywamy).
    Uwaga: benchmark to zwykłe `close` jednej spółki, **bez FIFO i bez FX** (nie
    normalizujemy waluty — decyzja #3).
  - `normalizeComparison(portfolio, benchmark)` — czysta funkcja (bez DB),
    przyjmuje `{date,value}[]` portfela (z `portfolioValueHistory`) i
    `{date,close}[]` benchmarku, zwraca:
    ```
    {
      portfolio: { time: string; value: number }[]; // znormalizowane do 100
      benchmark: { time: string; value: number }[]; // znormalizowane do 100
      baseDate: string | null;
      portfolioReturnPct: number | null; // (ostatnia/100 - 1)*100
      benchmarkReturnPct: number | null;
    }
    ```
    **Algorytm bazy 100:** `baseDate = max(pierwsza data portfela, pierwsza data
    benchmarku)` (pierwsza data, od której **obie** serie mają punkt). Dla każdej
    serii: `base = wartość na pierwszej dacie >= baseDate`; punkty od `baseDate`
    w górę mapujemy na `value/base*100`. Serie zostają na **własnych** datach
    (lightweight-charts wyrównuje serie po czasie — nie muszą mieć identycznych
    x-ów). Gdy brak nakładania się (np. portfel pusty albo benchmark bez świec w
    oknie) → obie tablice puste + `baseDate = null` (UI pokaże pusty stan).
  - Reużyj: `portfolioValueHistory` (już wołane w `page.tsx` — historię liczymy
    **raz** i przekazujemy do `normalizeComparison`, bez dublowania).

### Persystencja wyboru

- **`src/lib/settings.ts`** — dodać klucz do `SETTING_KEYS`:
  `dashboardBenchmark: "dashboard_benchmark_company_id"`. Reużyj istniejących
  `getSetting` / `setSetting` — bez nowych funkcji.
- **`src/app/api/settings/route.ts`** (`POST`) — dodać obsługę pola
  `benchmarkCompanyId` (analogicznie do istniejących gałęzi):
  - `""` (pusty string) → `setSetting(SETTING_KEYS.dashboardBenchmark, "")`
    (czyści wybór / „Brak").
  - wartość liczbowa (string) → walidacja: jeśli `Number.isInteger` i > 0 →
    `setSetting(...)`; w przeciwnym razie zignorować.
  - Nie dotykać `reloadScheduler()` (to nie cron) — dopisujemy przed
    `return NextResponse.json({ ok: true })`. GET **nie wymaga zmiany** (bieżący
    wybór dashboard czyta bezpośrednio przez `getSetting`, patrz niżej).
  - Reużyj: `setSetting`, `SETTING_KEYS`.
  - Tabela `settings` jest już w `BOOTSTRAP_SQL` (`src/db/index.ts:116`) →
    **żadnej migracji** (w przeciwieństwie do planu ETF, tu nie ruszamy schematu).

### Komponent wykresu

- **`src/components/charts/BenchmarkChart.tsx`** (NOWY) — `"use client"`, wzorzec
  1:1 z `CandleChart.tsx` (montaż, `applyOptions` na `colors`, cleanup serii):
  - Props: `{ portfolio: {time,value}[]; benchmark: {time,value}[]; portfolioLabel?: string; benchmarkLabel: string; height?: number }`.
  - Dwie serie przez `chart.addSeries(LineSeries, { color, lineWidth: 2,
    priceLineVisible: false, lastValueVisible: true })` — **bez** `priceScaleId`
    (wspólna domyślna prawa skala; obie w bazie 100).
  - Kolory z `useThemeColors()`: portfel = `colors.accent` (spójnie z dzisiejszym
    wykresem), benchmark = wyraźnie inny token motywu, rekomendacja `colors.cat3`
    (bursztyn — czytelny kontrast do niebieskiego w obu motywach). Kolory
    przeliczane przy zmianie motywu, jak w `CandleChart`.
  - `localization.priceFormatter` → format „100,0" (jednostki znormalizowane, nie
    waluta): `new Intl.NumberFormat("pl-PL",{maximumFractionDigits:1})`.
  - **Legenda** (lightweight-charts jej nie ma): mały wiersz HTML nad wykresem —
    dwie kropki w kolorach serii + etykiety (np. „Portfel" / „WIG"), stylem jak
    przełączniki w `PriceChart.tsx:64-95`.
  - Reużyj: struktura `CandleChart.tsx`, `useThemeColors` z `@/components/ThemeProvider`,
    import `LineSeries` z `lightweight-charts` (potwierdzony eksport w 5.2.0).

### Selektor (klient)

- **`src/components/BenchmarkSelect.tsx`** (NOWY) — `"use client"`, wzorzec z
  `WatchlistToggle.tsx` (POST + `router.refresh()`):
  - Props: `{ options: { id: number; label: string }[]; selectedId: number | null }`.
  - `Select` z `@/components/ui` (reużycie): pierwsza opcja `value=""` →
    „Benchmark: brak"; dalej opcje z `options` (np. `WIG · Indeks`).
  - `onChange`: `await fetch("/api/settings", { method:"POST", headers, body:
    JSON.stringify({ benchmarkCompanyId: e.target.value }) })` → `router.refresh()`
    (`""` czyści). Auto-submit, bez przycisku „Zastosuj" (patrz Pytania —
    rekomendacja).
  - Reużyj: `Select` z `src/components/ui.tsx`, `useRouter` z `next/navigation`.

### Dashboard

- **`src/app/page.tsx`** (server component) — spięcie całości:
  - Odczytać wybór: `const benchmarkId = Number(getSetting(SETTING_KEYS.dashboardBenchmark)) || null;`
    (import `getSetting`, `SETTING_KEYS` z `@/lib/settings`).
  - Zbudować listę kandydatów (jak `watchlist/page.tsx:28-33`):
    `db.select().from(companies).where(and(eq(companies.watchlist,1), inArray(companies.type, ["INDEX","ETF"]))).orderBy(asc(companies.ticker)).all()`.
    Zmapować na `{ id, label: `${c.ticker} · ${TYPE_LABELS[c.type]}` }`
    (etykiety `STOCK/ETF/INDEX` — reużyj mapę jak w `watchlist/page.tsx:21-25` /
    `companies/[id]/page.tsx:45-49`).
  - Rozwiązać wybraną spółkę: jeśli `benchmarkId` jest na liście kandydatów →
    policzyć `normalizeComparison(history, benchmarkCloseHistory(benchmarkId, 365))`;
    inaczej traktować jako brak (defensywnie — spółka mogła zniknąć / zmienić typ).
  - W nagłówku karty „Wartość portfela" (`actions` w `Card`, linia ~124):
    - jeśli są kandydaci → `<BenchmarkSelect options=... selectedId=... />`;
    - jeśli brak kandydatów → mały link-CTA („Dodaj indeks/ETF na Watchliście")
      do `/watchlist` (reużyj stylu linku jak `page.tsx:153` „wszystkie →").
  - Treść karty:
    - benchmark wybrany i `cmp.baseDate !== null` → `<BenchmarkChart portfolio=cmp.portfolio benchmark=cmp.benchmark benchmarkLabel=... />`;
      opcjonalnie pod wykresem podpis różnicy stóp zwrotu (patrz Pytania).
    - inaczej → dzisiejszy `<AreaChart data={history.map(...)} height={260} />`
      (bez zmian) lub istniejący `EmptyState` „Za mało danych".
  - Reużyj: `getSetting`, `benchmarkCloseHistory`, `normalizeComparison`,
    `AreaChart`, `db`/`companies` z `@/db`, `inArray`/`and`/`eq`/`asc` z `drizzle-orm`.

## Kryteria akceptacji

- [ ] Na dashboardzie w karcie „Wartość portfela" jest selektor benchmarku z
      opcją „brak" + spółkami watchlisty typu INDEX/ETF; brak takich spółek →
      zamiast selektora CTA do Watchlisty.
- [ ] Wybór benchmarku (np. `WIG` / `^GSPC` jako INDEX, albo `ETFBW20TR.WA` jako
      ETF) pokazuje na wykresie dwie linie znormalizowane do 100 na pierwszej
      wspólnej dacie; legenda rozróżnia „Portfel" i benchmark.
- [ ] Bez wybranego benchmarku wykres wygląda i działa jak dziś (AreaChart, PLN).
- [ ] Wybór jest zapamiętany (klucz `dashboard_benchmark_company_id` w `settings`)
      i wraca po odświeżeniu strony / ponownej wizycie.
- [ ] Obie serie i osie respektują motyw jasny/ciemny (przełączenie motywu
      przemalowuje wykres bez błędów).
- [ ] Benchmark **nie** jest przeliczany na PLN — jego linia to stopa zwrotu w
      walucie natywnej (np. `^GSPC` w USD, znormalizowany do 100).
- [ ] Zmiana benchmarku działa bez pełnego przeładowania strony
      (`router.refresh()`); wybór „brak" wraca do trybu PLN.
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się i feature działa w preview.

## Ryzyka

- **Baza normalizacji przy niepełnym pokryciu.** Portfel ma dane dopiero od
  pierwszej transakcji, benchmark bywa krótki (`WIG20.WA` = 1 świeca — patrz plan
  ETF). Gdy okna się nie nakładają, `normalizeComparison` musi zwrócić puste serie
  i `baseDate=null`, a UI pokazać pusty stan — inaczej dzielenie przez `base`
  z niewłaściwej daty da zafałszowany wykres. To najłatwiejsze miejsce do
  pomyłki.
- **Wyrównanie dat dwóch serii.** GPW i USA mają różne dni sesyjne; serie mają
  różne x-y. lightweight-charts wyrównuje po czasie i renderuje to poprawnie —
  **nie** wymuszamy wspólnej osi dat (to by wymagało forward-fill i psuło
  „surowe" close). Trzeba tylko upewnić się, że bazę 100 liczymy dla każdej serii
  z jej własnego punktu ≥ `baseDate`.
- **Ruchomy zakres = ruchoma baza.** Dashboard ma sztywne 365 dni, więc baza 100
  jest stała i liczona serwerowo. Gdyby w przyszłości dodać przełącznik zakresu na
  tym wykresie, normalizacja musiałaby przejść na klienta (baza = początek
  **widocznego** zakresu). Świadomie poza zakresem — odnotowane, by nie wpaść w
  pułapkę przy 2.x.
- **Spójność wyboru z danymi.** Zapamiętany `companyId` może wskazywać spółkę
  usuniętą albo taką, której typ zmieniono na STOCK. `page.tsx` musi zweryfikować,
  że id jest na liście kandydatów, i w razie czego zachować się jak „brak"
  (bez błędu).
- **Yahoo/dane benchmarku.** Historia benchmarku pochodzi z `quotes_daily`
  napełnianego przez `refreshQuotes` — jeśli użytkownik nie odświeżył notowań po
  dodaniu indeksu, serii nie będzie (pusty stan). To zachowanie spójne z resztą
  aplikacji; nie pobieramy tu nic ad-hoc.
- **Interpretacja porównania (nie TWR).** Normalizacja punkt-do-punktu ignoruje
  przepływy (dopłaty/wypłaty) w portfelu — przy dużych wpłatach w środku okresu
  „stopa zwrotu portfela" z krzywej wartości może być myląca względem benchmarku.
  Akceptowalne dla nakładki wizualnej; rzetelne porównanie stóp zwrotu to 2.3
  (TWR), poza zakresem. Warto to zakomunikować w UI (patrz Pytania).

## Decyzje (runda pytań — rozstrzygnięte)

- **UX przełącznika — auto-submit.** `BenchmarkSelect` wysyła POST i woła
  `router.refresh()` na `onChange`, bez przycisku „Zastosuj" (spójne z
  `WatchlistToggle`/`ThemeProvider`).
- **Wskaźnik różnicy stóp zwrotu — tak.** Pod/obok wykresu krótki podpis z
  `portfolioReturnPct` vs `benchmarkReturnPct` i różnicą w punktach procentowych
  (np. „Portfel +12,3% · WIG +8,1% · +4,2 pp"), reużywając `fmtPct` z
  `@/lib/format` i konwencji kolorów pos/neg (jak `Delta`/`StatTile` tone).
  Renderowany w `page.tsx` obok karty, na bazie pól `portfolioReturnPct` /
  `benchmarkReturnPct` już zwracanych przez `normalizeComparison`.
- **Nota o interpretacji (nie-TWR) — tak.** Jednozdaniowy podpis pod wykresem
  (mały, `text-muted`), np. „Porównanie krzywej wartości, nie uwzględnia
  wpłat/wypłat w trakcie okresu (pełna stopa zwrotu TWR/XIRR — poza zakresem)."
  Widoczny tylko gdy benchmark jest wybrany i wykres się renderuje.
- **Kolor serii benchmarku — `colors.cat3` (bursztyn).** Portfel zostaje
  `colors.accent`, tak jak dziś w `AreaChart`.

Brak dalszych otwartych pytań — plan gotowy do implementacji.
