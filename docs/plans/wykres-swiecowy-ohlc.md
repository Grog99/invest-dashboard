# Wykres świecowy OHLC jako opcja

> Plan wygenerowany przez skill `/plan-feature`. Slug: `wykres-swiecowy-ohlc`. Branch: `feature/wykres-swiecowy-ohlc`.

## Kontekst / Problem

Na karcie spółki (`src/app/companies/[id]/page.tsx`) wykres kursu (`PriceChart`) renderuje dziś wyłącznie linię/warstwę (`AreaSeries`, lightweight-charts v5) na podstawie samego `close`. Tabela `quotes_daily` przechowuje już pełne bary `open/high/low/close/volume` (`src/db/schema.ts:59-73`) i są one uzupełniane przy każdym odświeżeniu z Yahoo (`src/lib/quotes.ts:55-71`, `src/lib/yahoo.ts:84-91`) — dane do świec są gotowe, ale strona spółki pobiera z DB tylko `{ date, close }` (`src/app/companies/[id]/page.tsx:67-77`) i przekazuje do `PriceChart` jedynie `time`+`value` (linia 192).

Cel (roadmapa 1.3): dodać na karcie spółki przełącznik **linia / świece**, obok istniejącego przełącznika zakresu 3M/1R/3L/MAX. W trybie świecowym wyświetlić `CandlestickSeries` + `HistogramSeries` z wolumenem. Wartość: analiza techniczna bez wychodzenia do zewnętrznych serwisów.

Efekt oczekiwany: użytkownik na karcie spółki jednym kliknięciem przełącza wykres z linii na świece; w trybie świec pod świecami widoczny jest wolumen; zakres czasu (3M/1R/3L/MAX) działa niezależnie w obu trybach; zachowane formatowanie walutowe i pusty stan.

## Wymagania

- Przełącznik trybu **linia / świece** na karcie spółki, wizualnie spójny z istniejącym przełącznikiem zakresu (`RANGES` w `src/components/charts/PriceChart.tsx:8-13, 54-68`) — ten sam styl przycisków.
- Tryb **świece**: `CandlestickSeries` z barów OHLC; kolory wzrost/spadek spójne z tokenami motywu (`--color-pos` `#0ca30c`, `--color-neg` `#e66767` z `src/app/globals.css:15-16`).
- Tryb **świece**: `HistogramSeries` z wolumenem pod świecami (nakładka na dolnych ~20% wysokości), kolor słupka zgodny z kierunkiem świecy danego dnia (zielony gdy `close >= open`, czerwony gdy spadek).
- Tryb **linia**: bez zmian względem dziś (`AreaSeries` z `close`, wolumen niewidoczny).
- Zakres 3M/1R/3L/MAX działa tak samo w obu trybach (filtr po stronie klienta, jak dziś).
- Zachować formatowanie walutowe osi ceny (`fmt` z `Intl.NumberFormat` `style: currency`, dziś `src/components/charts/PriceChart.tsx:35-42`) i pusty stan „Brak danych historycznych — odśwież notowania." (linie 44-50).
- Poprawne czyszczenie serii/instancji wykresu przy przełączaniu trybu — brak wycieków pamięci i duplikatów serii.
- Stan trybu i zakresu: zwykły `useState` w komponencie, **bez** `localStorage`/`settings` — reset przy przeładowaniu strony (decyzja użytkownika, spójne z dzisiejszym `range`).

## Zakres i Non-goals

**W zakresie:**
- Rozszerzenie zapytania DB i propsów na karcie spółki, żeby `PriceChart` dostawał pełne bary OHLCV zamiast `date`+`close` (`src/app/companies/[id]/page.tsx:67-77, 191-194`).
- Nowy typ danych baru (`CandlePoint`) i zmiana sygnatury `PriceChart` z `AreaPoint[]` na ten typ.
- Nowy kliencki komponent wykresu świecowego `src/components/charts/CandleChart.tsx` (lightweight-charts v5: `CandlestickSeries` + `HistogramSeries`).
- Przełącznik trybu linia/świece w `PriceChart.tsx` + warunkowy render `AreaChart` (linia) albo `CandleChart` (świece).

**Non-goals (świadomie pomijamy):**
- Wykres wartości portfela na dashboardzie (`src/app/page.tsx:126` używa `AreaChart` bezpośrednio) — **zostaje bez zmian**. To inny przypadek użycia (brak per-instrument OHLC). `AreaChart.tsx` musi pozostać wstecznie kompatybilny, bo jest współdzielony.
- Zapamiętywanie wybranego trybu/zakresu (brak `localStorage`, brak klucza w `settings`).
- Wskaźniki techniczne (SMA/EMA/RSI itp.), rysowanie, drawing tools.
- Zmiana źródła/kształtu danych w DB lub w `src/lib/quotes.ts` / `src/lib/yahoo.ts` — bary OHLCV już tam są.
- Interwały inne niż dzienny (świece intraday/tygodniowe).

## Podejście

**Uwaga o regule z `AGENTS.md`:** feature nie wprowadza żadnego nowego API Next.js. Jedyna zmiana po stronie serwera to poszerzenie selecta Drizzle w istniejącym Server Component `src/app/companies/[id]/page.tsx` (warstwa better-sqlite3 + Drizzle, nie API Next.js) oraz przekazanie większej, w pełni serializowalnej tablicy obiektów jako prop do klienckiego komponentu `PriceChart` (`"use client"`) — zwykłe przekazanie danych przez granicę RSC, bez nowych prymitywów Next. Strona już dziś jest `export const dynamic = "force-dynamic"`, `params: Promise<{id}>`, `notFound()` — te wzorce się nie zmieniają. Dlatego nie zakładamy niczego nowego o API Next.js i nie ma potrzeby czytać `node_modules/next/dist/docs/` pod tę zmianę (przejrzano dostępne katalogi `01-app`/`02-pages`/`03-architecture` — brak nowej powierzchni do weryfikacji).

**Weryfikacja API lightweight-charts v5 (`node_modules`, wersja `5.2.0`).** Sprawdzono w `node_modules/lightweight-charts/dist/typings.d.ts`, żeby nie zgadywać z treningu (v5 zmieniło API względem v4):
- Serie dodaje się przez `chart.addSeries(SeriesDefinition, options, paneIndex?)` — **nie** przez `addCandlestickSeries()` (metoda z v4; w typings zostały tylko wzmianki w komentarzach `@example`, faktyczne API to `addSeries`). Sygnatura: `addSeries<T>(definition, options?, paneIndex?)` (typings linia 1640).
- Eksportowane definicje: `CandlestickSeries` i `HistogramSeries` (aliasy `candlestickSeries`/`histogramSeries`, typings linie 5036-5037) — importowane tak samo jak dziś `AreaSeries` w `AreaChart.tsx:9`.
- `CandlestickData` = `OhlcData` (`time, open, high, low, close`) + opcjonalne per-bar `color/borderColor/wickColor` (typings 837-850, 3444-3465). Opcje stylu: `upColor`, `downColor`, `borderUpColor`, `borderDownColor`, `wickUpColor`, `wickDownColor` (typings 854-...).
- `HistogramData` = `SingleValueData` (`time, value`) + opcjonalny per-bar `color` (typings 1322-1327). Opcje: `color`, `base`; wolumen z wbudowanym formatowaniem przez `priceFormat: { type: 'volume' }` na serii.
- Nakładka wolumenu na osobnej skali: seria histogramu z `priceScaleId: ''` (overlay) + `series.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })`; skala ceny świec dostaje `scaleMargins` np. `{ top: 0.05, bottom: 0.25 }`, żeby świece nie nachodziły na wolumen. (`priceScaleId` i `priceScale(id)` — typings 4044, 2069.)

**Kluczowa decyzja architektoniczna — osobny `CandleChart.tsx`, a nie jeden komponent obsługujący oba tryby.** `PriceChart` warunkowo renderuje `<AreaChart>` (tryb linia) albo `<CandleChart>` (tryb świece). Uzasadnienie:
- `AreaChart.tsx` jest **współdzielony** z dashboardem (`src/app/page.tsx:126` — wykres wartości portfela), więc jego sygnatury i zachowania nie wolno ruszać (potwierdzone grepem: `AreaChart` używany w `PriceChart.tsx` i `app/page.tsx`, `PriceChart` tylko w karcie spółki). Osobny komponent zeruje ryzyko regresji trybu liniowego i dashboardu.
- Czyszczenie przy przełączaniu trybu robi się „samo": zmiana trybu w `PriceChart` odmontowuje jeden komponent i montuje drugi; cleanup `useEffect` (`chart.remove()`) każdego z nich niszczy instancję wykresu. To prostsze i bezpieczniejsze niż `addSeries`/`removeSeries` różnych typów serii wewnątrz jednej instancji (tam łatwo o duplikat serii przy przełączaniu). `CandleChart` powiela dwuefektową strukturę `AreaChart` (efekt montażu tworzy `createChart` i sprząta `chart.remove()`; efekt danych dodaje serie i sprząta `removeSeries`).
- Koszt: powielenie konfiguracji `createChart` (layout/grid/crosshair/localization) między `AreaChart` a `CandleChart`. Akceptowalne; opcjonalnie (patrz „Pliki do zmiany") można wyciągnąć wspólne opcje bazowe do małego helpera, ale to nie jest wymagane w tej iteracji i nie może zmienić zachowania `AreaChart`.

**Przepływ danych.** `PriceChart` trzyma pełne bary (`CandlePoint[]`), filtruje je po zakresie (jak dziś), a następnie:
- tryb linia: mapuje na `AreaPoint[]` (`{ time, value: close }`) i przekazuje do `AreaChart` (interfejs `AreaChart` bez zmian);
- tryb świece: przekazuje przefiltrowane bary do `CandleChart`.

**Obsługa nulli w OHLCV (pułapka Yahoo).** W schemacie `open/high/low/volume` są **nullable** (`src/db/schema.ts:64-71` — tylko `close` jest `notNull`), a Yahoo potrafi zwrócić `null` dla pojedynczych barów (`DailyBar.open/high/low/volume: number | null` w `src/lib/yahoo.ts:8-15`; `close === null` jest pomijany, reszta może być `null`). `CandlestickSeries` wymaga liczbowego `open/high/low/close`. Dlatego w `CandleChart` bar mapujemy degradująco: `open: open ?? close`, `high: high ?? close`, `low: low ?? close`, `close` — brakujący bar staje się „doji" na poziomie `close` zamiast wywalać serię. Wolumen: `value: volume ?? 0` (brak wolumenu = brak słupka). Kolor słupka wolumenu: porównanie `close >= (open ?? close)`.

## Pliki do zmiany

- `src/app/companies/[id]/page.tsx` — poszerzyć select `bars` (dziś `{ date, close }`, linie 67-77) o `open`, `high`, `low`, `volume` z `quotesDaily`; zmienić mapowanie propsa `data` do `PriceChart` (linie 191-194) z `{ time, value }` na `{ time: date, open, high, low, close, volume }`. Reszta strony bez zmian.
- `src/components/charts/PriceChart.tsx` — (1) zmienić prop `data: AreaPoint[]` → `data: CandlePoint[]`; (2) dodać stan `const [mode, setMode] = useState<"line" | "candle">("line")`; (3) dodać drugą grupę przycisków (przełącznik trybu) **reużywając 1:1 stylu przycisków z `RANGES`** (linie 54-68) — proponowany layout nagłówka `flex items-center justify-between` z przełącznikiem trybu po lewej i zakresu po prawej; (4) filtr zakresu jak dziś (`d.time >= cutoffISO`); (5) render warunkowy: `mode === "line"` → `<AreaChart data={filtered.map(b => ({ time: b.time, value: b.close }))} valueFormatter={fmt} height={300} />` (interfejs `AreaChart` bez zmian), `mode === "candle"` → `<CandleChart data={filtered} valueFormatter={fmt} height={300} />`; (6) guard pustego stanu (linie 44-50) i `fmt` (35-42) bez zmian.
  - Reużyj: styl przycisku przełącznika z `PriceChart.tsx:59-64` (klasy `cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-medium ...`, aktywny `bg-surface2 text-ink`, nieaktywny `text-muted hover:text-ink2`) — wspólny wzorzec dla obu grup.
- `src/components/charts/CandleChart.tsx` — **nowy** kliencki komponent (`"use client"`), wzorowany strukturą na `AreaChart.tsx` (dwa `useEffect`: montaż `createChart`/`chart.remove()`, dane `addSeries`/`removeSeries`; `autoSize`, `containerRef`, `chartRef`, `formatterRef`). Props: `{ data: CandlePoint[]; height?: number; valueFormatter?: (v:number)=>string }`. Zawartość:
  - `import { createChart, CandlestickSeries, HistogramSeries, ColorType, type IChartApi, type UTCTimestamp } from "lightweight-charts"`.
  - Opcje `createChart` skopiowane z `AreaChart.tsx:40-66` (ten sam ciemny motyw: `background transparent`, `textColor "#898781"`, grid/crosshair, `localization.priceFormatter` = currency `fmt`) — spójność wizualna.
  - Świece: `chart.addSeries(CandlestickSeries, { upColor: "#0ca30c", downColor: "#e66767", borderUpColor: "#0ca30c", borderDownColor: "#e66767", wickUpColor: "#0ca30c", wickDownColor: "#e66767", priceLineVisible: false })` (kolory = tokeny `--color-pos`/`--color-neg`).
  - Skala świec: `candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.05, bottom: 0.25 } })`.
  - Wolumen: `chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" })`; `volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })`.
  - Dane świec: `data.map(b => ({ time: b.time as unknown as UTCTimestamp, open: b.open ?? b.close, high: b.high ?? b.close, low: b.low ?? b.close, close: b.close }))` (daty `YYYY-MM-DD` jako BusinessDay, dokładnie jak `AreaChart.tsx:88-92`).
  - Dane wolumenu: `data.map(b => ({ time: b.time as unknown as UTCTimestamp, value: b.volume ?? 0, color: (b.close >= (b.open ?? b.close)) ? "rgba(12,163,12,0.5)" : "rgba(230,103,103,0.5)" }))` (kolor zgodny z kierunkiem świecy, półprzezroczysty by nie dominował).
  - `chart.timeScale().fitContent()`; cleanup obu efektów jak w `AreaChart` (removeSeries w bloku try/catch, chart.remove na montażu).
  - Eksport typu `CandlePoint` (albo import ze wspólnego miejsca — patrz niżej).
- Typ `CandlePoint` — zdefiniować raz i współdzielić między `PriceChart` a `CandleChart`. Proponowane pola: `{ time: string; open: number | null; high: number | null; low: number | null; close: number; volume: number | null }` (lustro `DailyBar` z `src/lib/yahoo.ts:8-15`, ale `time` zamiast `date`). Umieścić np. eksport z `CandleChart.tsx` (jak `AreaPoint` jest eksportowany z `AreaChart.tsx:15-18`) i importować w `PriceChart`.
- Reużyj: `src/lib/format.ts` — istniejące `fmt` w `PriceChart` opiera się o `Intl.NumberFormat`; do wolumenu **nie** trzeba nowego formattera (wbudowany `priceFormat: { type: "volume" }` daje skróty k/M na osi wolumenu).
- `context/roadmap.md` — po wdrożeniu oznaczyć punkt 1.3 jako `✅ ZROBIONE` (wzorzec jak 1.1/6.3). Opcjonalne, poza kodem.

**Bez zmian (świadomie):** `src/components/charts/AreaChart.tsx` (współdzielony z dashboardem), `src/app/page.tsx`, `src/lib/quotes.ts`, `src/lib/yahoo.ts`, `src/db/schema.ts`.

## Kryteria akceptacji

- [ ] Na karcie spółki (`/companies/[id]`) nad wykresem widoczne są dwa przełączniki w jednym stylu: tryb (Linia/Świece) i zakres (3M/1R/3L/MAX).
- [ ] Domyślnie wykres jest liniowy i wygląda identycznie jak dziś (regresja trybu linii zerowa).
- [ ] Kliknięcie „Świece" pokazuje świece OHLC (zielone wzrostowe `#0ca30c`, czerwone spadkowe `#e66767`) oraz słupki wolumenu pod świecami; kolor słupka zgodny z kierunkiem świecy.
- [ ] Zmiana zakresu 3M/1R/3L/MAX działa w obu trybach i pokazuje odpowiednio przycięte dane.
- [ ] Wielokrotne przełączanie linia↔świece nie zostawia duplikatów serii ani nie rośnie zużycie pamięci (stary wykres jest niszczony przy odmontowaniu komponentu).
- [ ] Oś ceny formatuje wartości walutowo (`fmt`), oś wolumenu skrótami (k/M); pusty stan „Brak danych historycznych — odśwież notowania." wyświetla się gdy brak barów.
- [ ] Bary z częściowo `null` OHLC (Yahoo) nie wywalają wykresu (degradacja do świecy na poziomie `close`).
- [ ] Dashboard (`/`) i jego wykres wartości portfela działają bez zmian.
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się i feature działa w preview.

## Ryzyka

- **Nullowalne OHLCV z Yahoo.** `open/high/low/volume` bywają `null` (schemat i `DailyBar` to dopuszczają). Bez degradacji (`?? close` / `?? 0`) `CandlestickSeries.setData` może rzucić lub renderować śmieci. Mitigacja opisana w Podejściu — obowiązkowa.
- **API v5 vs pamięć treningowa.** Kuszące jest napisanie `chart.addCandlestickSeries()` (v4) — w v5 to `chart.addSeries(CandlestickSeries, ...)`. Zweryfikowane w `node_modules/.../typings.d.ts` (linie 1640, 5036-5037). Trzymać się `addSeries`.
- **Nakładka wolumenu / skale.** Jeśli `scaleMargins` świec i wolumenu się nie rozdzieli, świece i słupki nachodzą na siebie. Rozdzielenie: świece `{ top: 0.05, bottom: 0.25 }`, wolumen `priceScaleId: ''` + `{ top: 0.8, bottom: 0 }`.
- **Formatowanie osi wolumenu.** `localization.priceFormatter` (currency) jest globalny dla wykresu; wolumen musi mieć własne `priceFormat: { type: "volume" }` na serii, inaczej wolumen dostałby formatowanie walutowe. Ustawić `type: "volume"` na serii histogramu.
- **Duplikacja lifecycle'u.** `CandleChart` powiela konfigurację `createChart` z `AreaChart` — przy przyszłej zmianie motywu (roadmapa 6.5) trzeba pamiętać o dwóch miejscach. Świadomy kompromis na rzecz nietykania współdzielonego `AreaChart`.
- **Kolory hardcodowane w JS.** Tokeny motywu (`#0ca30c`, `#e66767`) są wpisane w JS, nie czytane z CSS (jak dziś w `AreaChart`). Spójne z obecnym stanem; przy motywie jasnym (6.5) wykresy i tak wymagają osobnego podejścia — poza zakresem.
- **Prop-drift `PriceChart`.** Zmiana sygnatury `data` z `AreaPoint[]` na `CandlePoint[]` dotyka tylko jednego wywołania (`companies/[id]/page.tsx`) — potwierdzone grepem, że `PriceChart` nie jest używany nigdzie indziej. Zaktualizować mapowanie propa razem z sygnaturą.

## Pytania do doprecyzowania

Brak otwartych pytań — obie kwestie rozstrzygnięte z użytkownikiem zgodnie z rekomendacją planu:
- Domyślny tryb po wejściu na kartę: **linia** (zachowawczo, jak dziś).
- Etykiety przełącznika trybu: **tekst** („Linia" / „Świece"), spójnie z przełącznikiem zakresu.
