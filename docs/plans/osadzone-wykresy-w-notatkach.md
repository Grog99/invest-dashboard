# Osadzone wykresy w notatkach

> Plan wygenerowany przez skill `/plan-feature`. Slug: `osadzone-wykresy-w-notatkach`. Branch: `claude/embedded-charts-notes-kn712g` (nietypowy — nie `feature/<slug>`).

## Kontekst / Problem

Punkt 5.2 roadmapy. Dziś teza inwestycyjna w notatce (i w odpowiedzi AI) może zawierać najwyżej martwy zrzut ekranu wykresu (przez załączniki, feature 5.1). Chcemy, żeby autor mógł wstawić w treść markdownu blok:

```
```chart PKN.WA 1R
```
```

…a `Markdown.tsx` wyrenderował w tym miejscu **żywy** `PriceChart` z danymi z `quotes_daily` dla wskazanej spółki. Wartość: teza z wykresem, który sam się aktualizuje po każdym odświeżeniu notowań, zamiast statycznego obrazka.

## Wymagania

- Blok ```` ```chart <IDENTYFIKATOR> [ZAKRES] ```` w markdownie renderuje interaktywny `PriceChart` dla wskazanej spółki.
- Identyfikator dopasowywany case-insensitive: **najpierw** po `companies.ticker` (np. `PKN`), a gdy brak trafienia — po `companies.quoteSymbol` (np. `PKN.WA`).
- Zakres opcjonalny; jeśli podany (`3M` / `1R` / `3L` / `MAX`, case-insensitive) ustawia **stan początkowy** zakresu w `PriceChart`. Domyślnie `1R`. Użytkownik może potem przełączać tryb (Linia/Świece) i zakres w samym wykresie.
- Wykres renderuje się **wszędzie**, gdzie używany jest komponent `Markdown`: podgląd edytora notatki (`NoteEditor.tsx`) oraz odpowiedzi asystenta (`AiChat.tsx`).
- Obsługa błędów inline (nigdy surowy blok): symbol nie pasuje do żadnej spółki → „Nie znaleziono spółki dla symbolu X — dodaj ją do aplikacji"; spółka istnieje, ale brak notowań w `quotes_daily` → „Brak danych historycznych dla X — odśwież notowania".
- Responsywność mobilna (~360–390px): osadzony wykres nie wychodzi poza kolumnę.
- Nad wykresem mały nagłówek z tickerem spółki (np. `PKN.WA`), żeby blok stojący sam był jednoznaczny.
- Wysokość osadzonego wykresu ~220px (niższy niż 300px na karcie spółki — kompaktowo w gęstej notatce).

## Zakres i Non-goals

**W zakresie:**
- Override `code` (i, dla poprawnego HTML, `pre`) w `src/components/Markdown.tsx`.
- Nowy kliencki komponent osadzenia `EmbeddedChart` (fetch + loading/error + `PriceChart`).
- Nowy route handler `GET /api/quotes/chart` zwracający `{ ticker, currency, bars }` po lookupie symbol → spółka.
- Drobna, wsteczniekompatybilna zmiana `PriceChart`: opcjonalny prop `initialRange`.

**Non-goals (świadomie pomijamy):**
- Wiele serii / porównywanie spółek na jednym osadzonym wykresie (to feature 4.3).
- Automatyczne odświeżanie notowań przy renderze bloku (blok czyta to, co jest w bazie; odświeżanie to osobny przycisk „Odśwież notowania").
- Autouzupełnianie / przycisk „wstaw wykres" w edytorze (można dodać później; MVP to sama składnia).
- Cache HTTP odpowiedzi endpointu (route handlery Next nie są cache'owane domyślnie — patrz Podejście).

## Podejście

**Reguła z `AGENTS.md` — weryfikacja API Next.js.** `node_modules` w środowisku planowania było puste (zależności nieзаinstalowane), więc nie dało się odczytać `node_modules/next/dist/docs/` ani źródeł `react-markdown`. Wnioski oparto na pinach z `package.json` (`react-markdown@^10.1.0`, `next@16.2.10`) i na **istniejących konwencjach repo**. Konkretnie: komentarz w `src/app/api/news/route.ts:12-14` cytuje `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` i stwierdza, że **route handlery NIE są cache'owane domyślnie**, więc nowy `GET` nie potrzebuje `export const dynamic`. Trzymamy się wzorca z tego pliku: `NextRequest` + `req.nextUrl.searchParams` + `NextResponse.json(...)` (z kodami 400/404). **Przed implementacją** wykonawca musi zainstalować zależności i potwierdzić dwa punkty oznaczone niżej jako [WERYFIKACJA].

**Dane po stronie klienta z nowego endpointu.** `Markdown` jest komponentem `"use client"` i renderuje się również w LIVE podglądzie edytora oraz w streamowanych odpowiedziach AI — nie ma tam serwera, który wstrzyknąłby bary. Dlatego osadzony komponent pobiera dane sam, klienckim `fetch` z nowego `GET /api/quotes/chart?symbol=...`. To jedyne czyste rozwiązanie działające w obu powierzchniach bez przekazywania propsów z serwera. Endpoint zwraca **całą** 5-letnią historię (jak strona spółki), a filtrowanie zakresu robi już `PriceChart` po stronie klienta (`PriceChart.tsx:36-43`) — nie duplikujemy filtrowania po zakresie w API.

**Składnia bloku — OSTATECZNA, jednoznaczna.**

Kanoniczna postać (zgodna z roadmapą 5.2):

```
```chart PKN.WA 1R
```
```

- Fence info-string: `chart` → react-markdown ustawia `className="language-chart"` na elemencie `<code>`. To jest nasz wyzwalacz (inline-code nigdy nie ma `language-chart`).
- Reszta info-stringa (`PKN.WA 1R`) → w react-markdown v10 element `<code>` dostaje prop `node` (węzeł hast), a `mdast-util-to-hast` przenosi meta fence'a do `node.data.meta`. Parsujemy `node?.data?.meta` (string typu `"PKN.WA 1R"`), dzieląc po białych znakach: `token[0]` = identyfikator, `token[1]` = opcjonalny zakres.

**Fallback (odporny na wersję):** jeśli `node.data.meta` jest puste/niedostępne, parsujemy **treść bloku** (`children` → string), biorąc pierwszą niepustą linię i dzieląc ją tak samo. Dzięki temu obie poniższe formy działają identycznie:

```
```chart PKN.WA 1R      ← identyfikator+zakres w info-stringu (kanoniczne)
```

```
```chart               ← identyfikator+zakres w treści bloku (fallback)
PKN.WA 1R
```
```

> [WERYFIKACJA 1] Po instalacji potwierdzić, że w zainstalowanym `react-markdown@10` element `code`/`pre` faktycznie dostaje `node.data.meta` z „PKN.WA 1R". Jeśli NIE — kanoniczną formą staje się wariant „identyfikator w treści bloku" (fallback), który jest gwarantowany niezależnie od wersji. Parser i tak obsługuje oba, więc zmiana dotyczy tylko dokumentacji/domyślnej rekomendacji dla użytkownika.

**Rozróżnienie blok vs inline w react-markdown v10.** W react-markdown v9+ prop `inline` został usunięty. Rozróżniamy po obecności `language-chart` w `className` elementu `code` — to wystarcza (zwykły inline `` `kod` `` i inne bloki nie mają tej klasy i lecą domyślną ścieżką). 

**Problem `<pre>` wrappera.** react-markdown owija blokowy `code` w `<pre>`. Renderowanie `<div>`/wykresu wewnątrz `<pre>` jest niepoprawnym HTML i psuje layout (monospace, `white-space: pre`). Dlatego nadpisujemy **też** `pre`: gdy jego jedyne dziecko to nasz chart-code (klasa `language-chart`), renderujemy samo dziecko bez `<pre>`. W przeciwnym razie zwykły `<pre {...props}>`.

> [WERYFIKACJA 2] Potwierdzić kształt `children` w overridzie `pre` w zainstalowanej wersji (zwykle pojedynczy element `code` z `props.className`). Detekcję zrobić defensywnie (sprawdzenie `React.isValidElement` + `className?.includes("language-chart")`).

**Streaming w AiChat — realny drobny problem i proponowany prop.** `AiChat.tsx` renderuje `Markdown` na CZĘŚCIOWEJ treści przy każdym delta stream. Jeśli AI wypisuje blok ```` ```chart PK ````, w połowie streamu `EmbeddedChart` odpaliłby fetch dla niepełnego symbolu → seria zbędnych 404 i migotanie błędu, aż stream się dokończy. (Podgląd w `NoteEditor` tego problemu NIE ma: `generateAi()` robi `setPreview(false)` na czas generowania — `NoteEditor.tsx:97`.)

Rekomendacja (spełnia decyzję użytkownika: domyślnie włączone wszędzie, prop tylko gdy realny problem): `Markdown` dostaje **opcjonalny** prop `embedCharts?: boolean` (default `true`). `AiChat` przekazuje `embedCharts={!busy}` — czyli osadzone wykresy materializują się dopiero, gdy odpowiedź skończy się streamować (kod bloku jest już kompletny). `NoteEditor` i wszystkie inne miejsca nie przekazują nic → domyślnie `true`. Gdy `embedCharts === false`, override `code` renderuje surowy blok kodu (nie fetchuje). Zapisana notatka z odpowiedzi AI (przez „Zapisz jako notatkę") i tak wyrenderuje wykres normalnie, bo tam `busy` nie występuje.

## Pliki do zmiany

- `src/components/charts/PriceChart.tsx` — dodać dwa opcjonalne propsy:
  - `initialRange?: RangeKey` (typ już istnieje w pliku, `PriceChart.tsx:17`): `useState<RangeKey>(initialRange ?? "1R")` zamiast `useState<RangeKey>("1R")` (`PriceChart.tsx:34`).
  - `height?: number` (default `300`), przekazywany do `AreaChart`/`CandleChart` (dziś zahardkodowane `height={300}` w `PriceChart.tsx:100,103`). Osadzenie użyje `height={220}`.
  Obie zmiany wsteczniekompatybilne — obecne wywołanie na stronie spółki (`companies/[id]/page.tsx`) działa bez zmian. **Reużyj** istniejącej listy `RANGES` i całej logiki filtrowania/przełączników.

- `src/components/charts/EmbeddedChart.tsx` — **NOWY**, kliencki (`"use client"`). Props: `{ symbol: string; initialRange?: RangeKey }`. Logika:
  - `useEffect`: `fetch("/api/quotes/chart?symbol=" + encodeURIComponent(symbol))`; stany `loading | error | ready`.
  - Walidacja symbolu przed fetchem (niepusty, sensowny wzorzec) — ogranicza szum przy ewentualnym renderze częściowej treści.
  - `res.status === 404` → komunikat „Nie znaleziono spółki dla symbolu `{symbol}` — dodaj ją do aplikacji".
  - `res.ok`, ale `bars.length === 0` → „Brak danych historycznych dla `{ticker ?? symbol}` — odśwież notowania".
  - `res.ok` z danymi → mały nagłówek z tickerem (`text-[12px] font-medium text-muted`, np. zwrócony `ticker` lub `symbol`) nad `<PriceChart data={bars} currency={currency} initialRange={initialRange} height={220} />`.
  - Kontener responsywny: `className="my-3 w-full max-w-full overflow-hidden rounded-lg border border-border p-2 sm:p-3"`. Wykresy (`AreaChart`/`CandleChart`) mają `autoSize: true`, więc dopasują szerokość do kolumny na 360px. Komunikaty błędów stylować jak istniejące (np. wzór z `AiChat.tsx:97-101` dla błędu, lub `text-[13px] text-muted` jak placeholder w `PriceChart.tsx:56`).
  - **Reużyj** typ `CandlePoint` z `src/components/charts/CandleChart.tsx` dla kształtu `bars`.

- `src/components/Markdown.tsx` — dodać do `components`:
  - Override `code`: jeśli `className?.includes("language-chart")` **oraz** `embedCharts !== false` → sparsuj identyfikator+zakres (z `node.data.meta`, fallback: pierwsza linia `children`) i zwróć `<EmbeddedChart symbol=… initialRange=… />`. W przeciwnym razie zwróć domyślny `<code className={className} {...rest}>{children}</code>`.
  - Override `pre`: jeśli jedyne dziecko to element `code` z `language-chart` (i `embedCharts !== false`) → zwróć samo dziecko (bez `<pre>`); inaczej `<pre {...props}>{children}</pre>`.
  - Zmienić sygnaturę: `export function Markdown({ children, embedCharts = true }: { children: string; embedCharts?: boolean })`.
  - **Reużyj** istniejący override `img` bez zmian.
  - Wydzielić helper parsujący, np. `parseChartMeta(meta: string): { symbol: string; range?: RangeKey }` (mały, lokalny w pliku lub w `src/lib/`). Zakres walidować do dozwolonego zbioru `["3M","1R","3L","MAX"]` case-insensitive; nieznany → `undefined` (czyli domyślne `1R`).

- `src/components/AiChat.tsx` — jedna zmiana: `<Markdown embedCharts={!busy}>{m.content}</Markdown>` (`AiChat.tsx:87`). `busy` już istnieje w komponencie.

- `src/app/api/quotes/chart/route.ts` — **NOWY** route handler `GET`. Wzoruj się na `src/app/api/news/route.ts` (odczyt `req.nextUrl.searchParams`, `NextResponse.json`, kody błędów) i `src/app/api/notes/route.ts` (styl). Logika:
  - `const symbol = req.nextUrl.searchParams.get("symbol")?.trim()`. Brak → `NextResponse.json({ error: "Brak parametru symbol." }, { status: 400 })`.
  - Lookup spółki: **najpierw** po `ticker` case-insensitive, przy braku po `quoteSymbol` case-insensitive. W Drizzle użyć `sql\`lower(${companies.ticker}) = lower(${symbol})\`` (import `sql` z `drizzle-orm`) albo pobrać kandydatów i porównać w JS. Zwrócić `id`, `ticker`, `currency`, `quoteSymbol`. Brak trafienia → `NextResponse.json({ error: "COMPANY_NOT_FOUND" }, { status: 404 })`.
  - Bary: **reużyj wzorzec zapytania z `src/app/companies/[id]/page.tsx:72-93`** — okno 5 lat wstecz (`gte(quotesDaily.date, fiveYearsAgoISO)`), filtr śmieciowych świec `gt(quotesDaily.close, 0)`, `orderBy(asc(quotesDaily.date))`, wybór pól `date/open/high/low/close/volume`.
  - **Uwaga na kształt danych:** `CandlePoint` ma pole `time` (nie `date`). Zmapować `date → time` przed zwróceniem, albo zwrócić `date` i mapować w `EmbeddedChart`. Zdecyduj jedno miejsce; rekomendacja: mapować w API (`bars: rows.map(r => ({ time: r.date, ...r }))`), żeby klient dostał gotowy `CandlePoint[]`.
  - Zwróć `NextResponse.json({ ticker, currency, bars })`. Pusta historia → `bars: []` (status 200), komunikat „brak danych" pokazuje klient.
  - **Import**: `import { db, companies, quotesDaily } from "@/db"` (barrel `src/db/index.ts` re-eksportuje schema — `index.ts:319`). `and, asc, eq, gt, gte, sql` z `drizzle-orm`.

## Kryteria akceptacji

- [ ] Blok ```` ```chart PKN.WA 1R ```` w podglądzie notatki renderuje interaktywny `PriceChart` (przełączniki Linia/Świece i 3M/1R/3L/MAX), z zakresem startowym `1R`.
- [ ] Dopasowanie po samym tickerze (```` ```chart PKN ````) też działa; oba case-insensitive.
- [ ] Blok bez zakresu (```` ```chart PKN.WA ````) startuje na `1R`.
- [ ] Nieznany symbol → inline „Nie znaleziono spółki dla symbolu … — dodaj ją do aplikacji"; spółka bez notowań → „Brak danych historycznych dla … — odśwież notowania". Surowy blok NIGDY nie zostaje widoczny.
- [ ] Ten sam blok w odpowiedzi `AiChat` renderuje wykres po zakończeniu streamu (bez migotania błędów w trakcie).
- [ ] Zwykłe bloki kodu i inline-code w markdownie renderują się jak dotąd (brak regresji).
- [ ] Na szerokości ~360–390px wykres i pasek przełączników mieszczą się w kolumnie (brak poziomego scrolla strony).
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się i feature działa w preview.

## Ryzyka

- **[WERYFIKACJA 1] `node.data.meta` w react-markdown v10** — jeśli meta nie jest przekazywana, kanoniczną składnią zostaje „identyfikator w treści bloku" (parser obsługuje oba, więc to tylko kwestia dokumentacji). Nie da się tego potwierdzić bez zainstalowanych zależności.
- **[WERYFIKACJA 2] Kształt `children` w overridzie `pre`** — detekcja chart-code musi być defensywna (`React.isValidElement`, opcjonalny `className`), inaczej zwykłada się na nietypowych węzłach.
- **`<div>` wewnątrz `<pre>`** — jeśli pominąć override `pre`, HTML jest niepoprawny i layout się psuje. Override `pre` jest obowiązkowy, nie „nice-to-have".
- **Streaming w AiChat** — mitygacja `embedCharts={!busy}` zależy od tego, że tylko ostatnia (streamowana) wiadomość jest niekompletna; wcześniejsze, kompletne wiadomości na moment `busy` też stracą wykres — akceptowalne, samonaprawia się po zakończeniu streamu.
- **Case-insensitive lookup w SQLite** — `lower()` w SQLite jest ASCII-only; tickery/quoteSymbole są ASCII (`PKN.WA`, `AAPL`, `^GSPC`), więc bezpieczne. Gdyby kiedyś pojawił się nie-ASCII symbol, porównanie mogłoby chybić (mało realne).
- **Kolizja ticker vs quoteSymbol** — celowa precedencja: najpierw `ticker`. Gdyby czyjś `ticker` = czyjś `quoteSymbol`, wygrywa ticker (świadome, zgodne z decyzją użytkownika).
- **Wydajność** — każdy osadzony wykres to osobny `fetch` + zapytanie 5-letnie. Notatka z wieloma blokami = wiele zapytań. Przy lokalnym SQLite i typowej liczbie bloków bez znaczenia; ewentualny cache/batch to przyszła optymalizacja (non-goal).
- **Reguła z `AGENTS.md`** — „to NIE jest Next.js, który znasz". Przed implementacją odczytać `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` i potwierdzić sygnaturę route handlera oraz brak potrzeby `export const dynamic`.

## Pytania do doprecyzowania

Wszystkie rozstrzygnięte (runda pytań):
- Nagłówek nad wykresem: **tak, mały nagłówek z tickerem** (wpisane w Wymagania / EmbeddedChart).
- Wysokość: **~220px** (nowy prop `height` w `PriceChart`, wpisane w Pliki do zmiany).
- [WERYFIKACJA 1] / [WERYFIKACJA 2] — techniczne punkty do potwierdzenia przez implementera po instalacji zależności (patrz Podejście/Ryzyka), nie wymagają decyzji użytkownika.
