# Obsługa ETF i indeksów (typ instrumentu)

> Plan wygenerowany przez skill `/plan-feature`. Slug: `obsluga-etf-indeksy`. Branch: `feature/obsluga-etf-indeksy`.

## Kontekst / Problem

Aplikacja nie zna pojęcia „typ instrumentu" — wszystko to jedna tabela `companies`
(`src/db/schema.ts`) traktowana jak akcja. Skutki zgłoszone przez użytkownika na
przykładzie WIG20:

- **Brak pełnej historii na wykresie.** Dla WIG20 użyto symbolu indeksu
  `WIG20.WA`. Zweryfikowane empirycznie (Yahoo v8 chart): `WIG20.WA` zwraca
  `instrumentType=INDEX`, bieżącą cenę w `meta` (~3674 pkt), ale **tylko 1
  świecę (dzisiejszą)** — `chart.result[0].timestamp` ma 1 element. Do
  `quotes_daily` trafia więc praktycznie jeden wiersz → płaski wykres i brak
  `prevClose` („Dzisiaj —").
- **Niepoprawny wynik pozycji.** P&L liczy się arytmetycznie poprawnie, ale
  względem **punktów indeksu**, a nie ceny realnego instrumentu (ETF), więc
  wynik jest bez sensu (indeksu nie da się realnie trzymać).

Rozwiązanie: wprowadzić **typ instrumentu** (Akcje / ETF / Indeks), rozszerzyć
istniejący formularz „+ Spółka" o pole Typ, sterować sugestią symbolu Yahoo per
typ, a INDEX traktować jako obserwację (wykres + watchlista, bez pozycji/P&L).

### Wynik weryfikacji symboli Yahoo (empiryczny, `period1=0&period2=9999999999&interval=1d`)

| Symbol | instrumentType | currency | świece (timestamps) | wniosek |
|---|---|---|---|---|
| `WIG20.WA` | INDEX | PLN | **1** (tylko dziś) | indeks WIG20 — brak historii OHLC na Yahoo |
| `^WIG20` | MUTUALFUND | null | **0** | nie działa — nie używać |
| `^WIG` | MUTUALFUND | null | **0** | nie działa — nie używać |
| `WIG.WA` | INDEX | PLN | **1750** (od 2019-07) | szeroki WIG jako indeks — historia jest |
| `ETFBW20.WA` | — | — | 404 Not Found | zły ticker |
| **`ETFBW20TR.WA`** | **ETF** | **PLN** | **1894** (od 2019-01) | **Beta ETF WIG20TR — pełna historia, poprawny wybór dla „WIG20"** |
| `ETFBWTECH.WA` | ETF | PLN | 1273 (od 2021-06) | ETF — pełna historia (kontrola) |
| `^GSPC` (S&P500) | INDEX | USD | 14248 (od 1970) | indeksy USA: prefiks `^` działa, pełna historia |
| `^NDX` (Nasdaq100) | INDEX | USD | 10269 | jw. |

Kluczowe wnioski dla `suggestQuoteSymbol`:

- **ETF GPW** → sufiks `.WA` (jak akcje). Dla WIG20 poprawny symbol to
  `ETFBW20TR.WA` (użytkownik wpisze ticker `ETFBW20TR`).
- **Indeks GPW** → `.WA` (bez karetki). `WIG.WA` ma historię; **ale `WIG20.WA`
  na Yahoo nie ma dziennej historii OHLC** — to ograniczenie danych Yahoo, nie
  formatu symbolu. Dlatego WIG20 obserwujemy jako ETF, nie jako indeks.
- **Indeks USA/OTHER** → prefiks `^` (`^GSPC`, `^NDX`) — pełna historia.

## Wymagania

- W formularzu „+ Spółka" (`CompanyForm`) dochodzi pole **Typ**: Akcje (STOCK) /
  ETF / Indeks (INDEX). Bez osobnego przycisku „+ ETF".
- **STOCK i ETF** — pełny wynik pozycji / P&L jak dziś (FIFO, PLN po NBP, PIT-38).
- **INDEX** — tylko obserwacja: wykres + watchlista. Nie liczymy pozycji/wyniku,
  nie pojawia się w holdingach portfela ani w podsumowaniu PIT.
- Sugestia symbolu Yahoo zależna od typu i rynku (patrz tabela wyżej).
- Po zmianie symbolu istniejącej spółki (np. WIG20.WA → ETFBW20TR.WA) wykres i
  P&L mają się poprawić — wymaga wyczyszczenia zcache'owanych świec + pełnego
  re-fetchu (patrz „Ryzyka").
- Migracja schematu **idempotentna** z tanią bramką read-only (build Next.js
  odpala N równoległych workerów na tej samej bazie — patrz `src/db/index.ts`).
- Danych użytkownika **nie migrujemy** — baza jest lokalna i gitignorowana,
  istniejące wiersze dostają `type='STOCK'` z DEFAULT; wpis WIG20 użytkownik
  poprawi sam przez UI po wdrożeniu pola Typ.

## Zakres i Non-goals

**W zakresie:**
- Kolumna `companies.type` (STOCK|ETF|INDEX, DEFAULT 'STOCK') + typ TS + migracja.
- `suggestQuoteSymbol(ticker, market, type)` — rozszerzenie o typ.
- `CompanyForm` — pole Typ (Select), sugestia symbolu per typ, podpowiedzi.
- API `companies` POST/PATCH — walidacja i zapis `type`; re-fetch po zmianie symbolu.
- `computePortfolio` — wykluczenie INDEX z holdings.
- Strona instrumentu — badge typu, kafelek „obserwacja" zamiast „Wynik pozycji"
  dla INDEX, blokada UI transakcji dla INDEX.
- Filtrowanie INDEX z selektorów spółek w formularzach transakcji/dywidend.

**Non-goals (świadomie pomijamy):**
- Migracja/naprawa istniejącego wpisu WIG20 w bazie (robi to użytkownik w UI).
- Osobny widok/lista ETF-ów (do rozważenia później — patrz Pytania).
- Alternatywne źródła danych (Stooq jest martwy — patrz MEMORY.md; nie ruszamy).
- Śledzenie „wirtualnej pozycji" indeksu (kupno referencyjne itp.).
- Zmiana modelu newsów/dywidend dla INDEX.

## Podejście

Minimalna, addytywna zmiana modelu: jedna kolumna `type` na `companies`, sterująca
trzema rzeczami — (1) sugestią symbolu Yahoo, (2) udziałem w silniku portfela,
(3) prezentacją na stronie instrumentu. STOCK i ETF zachowują się identycznie w
silniku portfela (ta sama matematyka pozycji) — różnią się tylko sugestią symbolu
i etykietą. INDEX jest „watch-only": wcześnie wypada z `computePortfolio`, więc
naturalnie znika z holdingów, dashboardu, PIT i alokacji.

Sugestię symbolu trzymamy w **jednym miejscu** — funkcji `suggestQuoteSymbol`
(`src/lib/yahoo.ts`) — i importujemy ją do klienta `CompanyForm` zamiast
duplikować logikę inline (dziś jest zduplikowana, `CompanyForm.tsx:42`).
`yahoo.ts` nie ma zależności server-only (używa globalnego `fetch`), więc import
do komponentu klienckiego jest bezpieczny.

Zmiana symbolu istniejącej spółki wymaga świadomej obsługi cache: świece w
`quotes_daily` są kluczowane po `companyId`, a inkrementalny refresh
(`refreshCompany`, `src/lib/quotes.ts:37`) dobiera dane tylko od ostatniej świecy
−7 dni. Po zmianie `WIG20.WA`→`ETFBW20TR.WA` w cache zostaje 1 wiersz indeksu w
skali ~3674 pkt; nowe świece ETF (~75 PLN) dokleją się przy innych datach, ale
(a) skala Y wykresu się rozjedzie i (b) pełna historia ETF nie zejdzie (refresh
startuje od „ostatniej świecy"). Dlatego przy zmianie symbolu **kasujemy
`quotes_daily` + `quotes_latest` tej spółki i robimy pełny re-fetch**.

Reguła `AGENTS.md` (to nie jest „ten" Next.js): dotykamy istniejących Route
Handlerów (`src/app/api/companies/route.ts`, `.../[id]/route.ts`). Sprawdzono
`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` —
potwierdza obecne konwencje: handlery to `GET/POST/PATCH/DELETE` w `route.ts`,
`NextRequest`/`NextResponse`, a `context.params` jest **Promise** (`await
ctx.params`) — dokładnie tak, jak w istniejącym `[id]/route.ts`. Nie wprowadzamy
nowych wzorców routingu; jedynie dokładamy walidację pola i logikę re-fetchu w
istniejących handlerach. Strony (`page.tsx`) pozostają server components z
`export const dynamic = "force-dynamic"` — bez zmian w modelu renderowania.

## Pliki do zmiany

- **`src/db/schema.ts`** — do `companies` dodać
  `type: text("type").notNull().default("STOCK")` (komentarz: `STOCK | ETF | INDEX`).
  Dodać stałą i typ do reużycia, np.
  `export const INSTRUMENT_TYPES = ["STOCK","ETF","INDEX"] as const;`
  `export type InstrumentType = (typeof INSTRUMENT_TYPES)[number];`
  (`Company` pozostaje inferowany — `type` będzie `string`; stała służy do
  walidacji w API i etykiet w UI). Umieścić kolumnę np. po `watchlist`.

- **`src/db/index.ts`** — dwie rzeczy, wzorowane na `needsNewsDedupMigration` /
  `migrateNewsDedup`:
  1. `BOOTSTRAP_SQL`: w `CREATE TABLE IF NOT EXISTS companies (...)` dodać
     `type TEXT NOT NULL DEFAULT 'STOCK'` (świeże bazy).
  2. Idempotentna migracja dla istniejących baz:
     - `needsCompanyTypeMigration(sqlite)` — **tani read-only guard**: `PRAGMA
       table_info(companies)`, zwróć `true` gdy brak kolumny `type`. (Bez żadnych
       zapisów, żeby N workerów `next build` nie biło się o blokadę WAL — patrz
       istniejący komentarz przy `needsNewsDedupMigration`.)
     - `migrateCompanyType(sqlite)` — jeśli guard `true`, w `sqlite.transaction`:
       `ALTER TABLE companies ADD COLUMN type TEXT NOT NULL DEFAULT 'STOCK'`
       (dozwolone — stały DEFAULT; istniejące wiersze dostaną 'STOCK').
     - Wywołać z `createDb()` po `sqlite.exec(BOOTSTRAP_SQL)`, obok
       `migrateNewsDedup(sqlite)`.
  - Reużyj: istniejący wzorzec guard+transakcja z tego pliku.

- **`src/lib/yahoo.ts`** — rozszerzyć
  `suggestQuoteSymbol(ticker, market, type = "STOCK")`:
  - `INDEX` + `GPW` → `TICKER.WA` (bez karetki; `WIG.WA` działa).
  - `INDEX` + `US`/`OTHER` → `^TICKER` (`^GSPC`, `^NDX`).
  - `STOCK`/`ETF` → jak dziś (GPW `.WA`, inaczej ticker bez zmian).
  - Zachować domyślny 3. argument, by nie zepsuć innych wywołań.

- **`src/app/api/companies/route.ts`** (POST) — sparsować i zwalidować typ:
  `const type = INSTRUMENT_TYPES.includes(body.type) ? body.type : "STOCK";`
  Przekazać do `suggestQuoteSymbol(ticker, market, type)`; dopisać `type` do
  `insert(...).values({...})`. Reużyj: `suggestQuoteSymbol`, `refreshQuotes` (bez
  zmian — refetch nowej spółki działa jak dziś).

- **`src/app/api/companies/[id]/route.ts`** (PATCH) — trzy zmiany:
  1. Walidacja typu: `if (INSTRUMENT_TYPES.includes(body.type)) updates.type = body.type;`
  2. **Re-fetch po zmianie symbolu**: przed `update` odczytać dotychczasowy wiersz
     (stary `quoteSymbol`); po `update`, jeśli znormalizowany `quoteSymbol` się
     zmienił → `db.delete(quotesDaily).where(eq(companyId))` +
     `db.delete(quotesLatest).where(eq(companyId))`, potem `await
     refreshQuotes([companyId])` i zwrócić `refreshError` w odpowiedzi (jak POST).
     `CompanyForm.save()` już obsługuje `data.refreshError` niezależnie od metody
     (`CompanyForm.tsx:72`), więc UI to pokaże.
  3. Import `quotesDaily`, `quotesLatest`, `refreshQuotes`. Konwencja handlera
     bez zmian (`NextRequest`, `await ctx.params` — Promise; zgodne z docs
     route-handlers).
  - Reużyj: `refreshQuotes` (`src/lib/quotes.ts`).

- **`src/components/CompanyForm.tsx`** — pole Typ + sugestia per typ:
  - Stan: `const [type, setType] = useState(company?.type ?? "STOCK")`.
  - `Select` „Typ" (Akcje / ETF / Indeks) — reużyj `Select` z `ui.tsx`; umieścić
    obok „Rynek".
  - Zastąpić inline `suggestedSymbol` (linie 42–47) wywołaniem importowanego
    `suggestQuoteSymbol(ticker, market, type)` z `@/lib/yahoo` — jedno źródło prawdy.
  - Podpowiedź kontekstowa dla INDEX (np. pod polem symbolu): „Indeks = tylko
    podgląd (wykres + watchlista), bez pozycji. GPW: `WIG.WA`, USA: `^GSPC`.
    Uwaga: WIG20 nie ma historii na Yahoo — dla ekspozycji na WIG20 wybierz typ
    ETF i symbol `ETFBW20TR.WA`."
  - `type` dodać do `payload` w `save()`.
  - **Auto-watchlista (decyzja):** przy wyborze typu INDEX w `onTypeChange`
    domyślnie ustawić `setWatchlist(true)` (tylko tryb tworzenia — `!company`;
    użytkownik może odznaczyć). Analogicznie do istniejącego `onMarketChange`.
  - Reużyj: `Select`, `Input`, `Label` z `ui.tsx`; `suggestQuoteSymbol`.

- **`src/lib/portfolio.ts`** — w `computePortfolio()`, w pętli
  `for (const company of allCompanies)` dodać na początku
  `if (company.type === "INDEX") continue;` — INDEX nie tworzy holdingu ani
  realized sales. `portfolioValueHistory()` sumuje tylko `shares>0`, a INDEX nie
  ma transakcji, więc wypada naturalnie; dla pewności można dodać analogiczny
  skip przy budowie `state` (niski priorytet). Dywidendy INDEX-a i tak nie
  istnieją. Efekt: dashboard, alokacja (`AllocationDonut`), portfolio i PIT
  automatycznie pomijają INDEX (konsumują `summary.holdings`).

- **`src/app/api/transactions/route.ts`** (POST) — **twarda blokada serwera
  (decyzja):** po ustaleniu `companyId` sprawdzić typ spółki; gdy
  `company.type === "INDEX"` zwrócić `400` (np. „Nie można dodać transakcji dla
  indeksu — indeks jest tylko obserwowany."). Obrona na wypadek bezpośredniego
  requestu z pominięciem UI. (Analogicznie rozważyć `POST /api/dividends`, jeśli
  ten sam wzorzec — implementer sprawdzi, czy dywidendy też odfiltrować.)

- **`src/app/companies/[id]/page.tsx`** — prezentacja per typ:
  - Badge typu w nagłówku obok `market`/`currency` (mapa etykiet:
    STOCK→„Akcje", ETF→„ETF", INDEX→„Indeks"). Reużyj `Badge` z `ui.tsx`.
  - Dla INDEX `holding` będzie `undefined` (bo `computePortfolio` go pomija) →
    kod wchodzi w gałąź `else` (linie 187–193). Rozdzielić tę gałąź: dla
    `company.type === "INDEX"` pokazać kafelek `StatTile` label „Status"
    value „Indeks — obserwacja" (bez „brak akcji w portfelu"); dla STOCK/ETF bez
    pozycji zostaje dzisiejsze „Bez pozycji / Obserwowana".
  - Dla INDEX ukryć kartę „Transakcje" i przycisk „+ Dodaj" transakcję (pozycji
    indeksu nie prowadzimy). **Decyzja: blokada twarda + miękka** — UI ukrywa,
    a serwer dodatkowo odrzuca (patrz `src/app/api/transactions/route.ts` niżej).
  - `TransactionModalButton` na tej stronie dostaje `companies={allCompanies}` —
    odfiltrować INDEX: `allCompanies.filter(c => c.type !== "INDEX")`, żeby nie
    dało się wybrać indeksu jako spółki transakcji.
  - Wykres (`PriceChart`) bez zmian — dla ETF pokaże pełną historię; dla INDEX
    pokaże tyle, ile Yahoo odda (WIG.WA sporo, WIG20 mało — ograniczenie źródła).

- **`src/app/portfolio/page.tsx`** — do `TransactionModalButton` i
  `DividendModalButton` przekazywać `allCompanies.filter(c => c.type !== "INDEX")`,
  żeby indeksów nie dało się wybrać przy dodawaniu transakcji/dywidend. Tabela
  „Pozycje" i tak nie pokaże INDEX (nie ma holdingu).

- **`src/app/watchlist/page.tsx`** — bez zmian funkcjonalnych; INDEX pojawia się
  tu naturalnie (watchlist=1). Opcjonalnie dodać kolumnę/badge Typ (kosmetyka).

- **`src/lib/ai.ts`** (linia ~39) — buduje kontekst „rynek: {market}"; można
  dorzucić „typ: {type}" (opcjonalne, kosmetyczne dla asystenta AI).

## Kryteria akceptacji

- [ ] Migracja: na istniejącej bazie po starcie `companies` ma kolumnę `type`
      z wartością `'STOCK'` dla wszystkich starych wierszy; ponowny start nie
      robi zapisu (guard read-only zwraca `false`).
- [ ] Świeża baza (`DATA_DIR` na pusty katalog) tworzy `companies.type` z
      `BOOTSTRAP_SQL`.
- [ ] Formularz „+ Spółka" ma pole Typ (Akcje/ETF/Indeks); zmiana Typ/Rynek
      aktualizuje podpowiadany symbol (ETF GPW `.WA`, INDEX USA `^…`).
- [ ] Dodanie ETF `ETFBW20TR.WA` (typ ETF, GPW) pobiera pełną historię —
      wykres pokazuje wieloletnią serię, „Dzisiaj" ma wartość (nie „—").
- [ ] Dodanie indeksu (np. ticker `WIG`, typ Indeks, GPW → `WIG.WA`) pokazuje
      wykres z historią; strona nie pokazuje kafelka „Wynik pozycji" ani karty
      transakcji, tylko status „Indeks — obserwacja".
- [ ] INDEX nie pojawia się w holdingach na `/portfolio`, na dashboardzie ani w
      alokacji; nie da się wybrać INDEX-a w formularzu transakcji/dywidendy.
- [ ] `POST /api/transactions` dla spółki typu INDEX zwraca `400` (twarda blokada
      serwera), niezależnie od UI.
- [ ] Wybór typu Indeks w formularzu automatycznie zaznacza „Obserwuj na
      watchliście" (przy dodawaniu nowej spółki).
- [ ] Zmiana symbolu istniejącej spółki przez „Edytuj" czyści stare świece i
      pobiera historię nowego symbolu (skala wykresu odpowiada nowemu
      instrumentowi, nie zostają stare punkty indeksu).
- [ ] `npm run lint` i `npm run build` przechodzą (build z równoległymi
      workerami nie rzuca `SQLITE_BUSY`).
- [ ] Aplikacja odpala się i feature działa w preview.

## Ryzyka

- **WIG20 jako indeks nie da historii na Yahoo (potwierdzone).** `WIG20.WA` =
  tylko bieżąca cena, `^WIG20` = nic. To ograniczenie danych Yahoo. Mitigacja:
  kierować użytkownika na ETF `ETFBW20TR.WA` (pełna historia). Podpowiedź w
  `CompanyForm` musi to jasno komunikować. Nie każdy indeks GPW jest tak ubogi
  (`WIG.WA` ma historię) — INDEX jako typ ma sens, ale akceptujemy, że wykres
  bywa pusty/krótki dla części indeksów.
- **Zmiana symbolu a cache świec.** Bez czyszczenia `quotes_daily`/`quotes_latest`
  i pełnego re-fetchu wykres po zmianie symbolu jest zepsuty (mieszanie skal,
  brak pełnej historii przez inkrementalny refresh w `refreshCompany`). Obsłużone
  w PATCH — to najłatwiejsze do przeoczenia miejsce.
- **Migracja pod równoległym `next build`.** ALTER TABLE to zapis; MUSI być za
  tanim read-only guardem (`PRAGMA table_info`), inaczej N workerów rywalizuje o
  blokadę WAL → `SQLITE_BUSY` (dokładnie problem opisany w komentarzu przy
  `needsNewsDedumMigration`). `busy_timeout=15000` daje bufor, ale guard jest
  właściwym rozwiązaniem.
- **`ALTER TABLE ADD COLUMN NOT NULL` w SQLite** — dozwolone tylko ze **stałym**
  DEFAULT (`'STOCK'` jest stałą) — OK. Gdyby DEFAULT był niestały, trzeba by
  kolumny nullable + backfill.
- **Rozjazd sugestii symbolu.** Dziś logika `.WA` jest w dwóch miejscach
  (`yahoo.ts` i inline w `CompanyForm`). Po dodaniu typu łatwo je rozjechać —
  dlatego rekomendacja: import `suggestQuoteSymbol` do `CompanyForm` (jedno
  źródło prawdy).
- **Yahoo rate-limit / sieć.** Weryfikacja symboli robiona w tym planie; w
  implementacji fetch nowej spółki może zwrócić 429/timeout — obecny kod już to
  łapie (`refreshError` nie blokuje utworzenia). Bez zmian.
- **Filtrowanie INDEX z selektorów transakcji** trzeba zastosować spójnie
  (portfolio i strona instrumentu), inaczej użytkownik utworzy bezsensowną
  pozycję na indeksie mimo blokady na stronie.

## Decyzje (runda pytań — rozstrzygnięte)

- **Transakcje dla INDEX — blokada twarda + miękka.** UI ukrywa transakcje dla
  INDEX i odfiltrowuje INDEX z selektorów; dodatkowo `POST /api/transactions`
  odrzuca (`400`) transakcję dla spółki typu INDEX (obrona serwera).
- **Auto-watchlist dla INDEX — tak.** Wybór typu Indeks przy tworzeniu spółki
  domyślnie zaznacza „Obserwuj na watchliście" (użytkownik może odznaczyć).
- **Etykiety pola Typ — „Akcje / ETF / Indeks"** (wartości w DB: `STOCK|ETF|INDEX`).
- **ETF == STOCK w silniku portfela** — ta sama matematyka FIFO/PIT; różnica tylko
  w etykiecie i sugestii symbolu. Potwierdzone.
- **Osobny widok/lista ETF-ów — poza zakresem** tej iteracji (ewentualnie później).
- **Domyślny symbol dla WIG20** — podpowiedź w `CompanyForm` twardo wskazuje
  `ETFBW20TR.WA` (Beta ETF WIG20TR) jako właściwą ekspozycję na WIG20.

Brak otwartych pytań — plan gotowy do implementacji.
