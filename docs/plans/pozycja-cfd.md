# Pozycja CFD (WIG20) — ręczna pozycja z żywym P&L

> Plan wygenerowany przez skill `/plan-feature`. Slug: `pozycja-cfd`. Branch: `feature/pozycja-cfd`.

## Kontekst / Problem

Użytkownik trzyma na XTB kontrakt CFD na **WIG20** (broker wycenia go z futures FW20) i chce widzieć tę pozycję w dashboardzie razem z „żywym" wynikiem (P&L), doliczanym do obrazu portfela. Dziś aplikacja zna tylko akcje/ETF/indeksy przez silnik FIFO + PIT-38 (`src/lib/portfolio.ts`) — nie ma miejsca na lewarowaną pozycję pochodną, a wpięcie CFD w FIFO/PIT byłoby błędne (inny model rozliczenia, dźwignia, brak „ilości akcji").

Potrzeba: **osobny, prosty byt** — ręcznie wprowadzana pozycja CFD z automatyczną ceną bieżącą z Yahoo (`WIG20.WA`), z możliwością nadpisania ceny/P&L „wg XTB", pokazujący wynik niezrealizowany i wartość nominalną (ekspozycję), wliczany do majątku jako mark-to-market (sam P&L, nie ekspozycja).

## Wymagania

**Funkcjonalne:**
- Ręczne dodanie/edycja/usunięcie pozycji CFD: kierunek (LONG/SHORT), wolumen (loty), cena otwarcia (pkt), wartość punktu (PLN/pkt na 1 lot), symbol notowań (domyślnie `WIG20.WA`), data otwarcia, notatka.
- Automatyczne pobranie bieżącej ceny bazowej z Yahoo (`WIG20.WA`) — reużycie istniejącego przycisku „Odśwież ceny".
- **Hybrydowy P&L:** domyślnie szacowany z kursu Yahoo; pola nadpisania „wg XTB" (bieżący kurs **lub** wprost P&L), które wygrywają, gdy ustawione.
  - Wzór szacunku: `P&L = (kurs_bieżący − cena_otwarcia) × znak_kierunku × wolumen × wartość_punktu`, gdzie `znak_kierunku = +1 (LONG) / −1 (SHORT)`, `kurs_bieżący = override_price ?? cena_z_Yahoo`.
  - Priorytet: `override_pnl` (jeśli ustawione) → wygrywa nad wszystkim; inaczej wzór z `override_price ?? quote_price`.
- **Wartość nominalna (ekspozycja):** `wolumen × kurs_bieżący × wartość_punktu` — pokazywana obok wyniku (widoczna dźwignia), **NIE sumowana** do wartości portfela.
- Wkład do majątku = **niezrealizowany P&L** pozycji (mark-to-market), doliczany do nagłówkowej wartości portfela na dashboardzie, wyraźnie opisany.
- Znacznik źródła wyniku w UI: „szacunek Yahoo" vs „wg XTB" (gdy użyto nadpisania) + informacja o przybliżeniu (futures vs indeks kasowy).

**Niefunkcjonalne:**
- CFD **poza** silnikiem FIFO i PIT-38 (`computePortfolio`/`computeYearlyTax` bez zmian merytorycznych).
- Responsywność mobilna (widok kartowy na ~360–390px, patrz `AGENTS.md` + `docs/plans/pwa-wersja-mobilna.md`).
- Kwoty w PLN (WIG20 CFD rozliczany w PLN); format przez istniejące helpery `src/lib/format.ts`.
- Lazy DB init nienaruszony (nowa tabela wyłącznie przez `CREATE TABLE IF NOT EXISTS` w bootstrapie).

## Zakres i Non-goals

**W zakresie:**
- Nowa tabela `cfd_positions` (osobny byt, wzorem planowanej tabeli `bonds` z roadmapy 2.5) + bootstrap w `src/db/index.ts`.
- Model + czysta funkcja licząca (`src/lib/cfd.ts`): efektywna cena, P&L (szacunek/override), ekspozycja, znacznik źródła, suma P&L.
- Reużycie potoku odświeżania: `refreshQuotes()` dociąga też cenę `WIG20.WA` dla pozycji CFD (Yahoo `fetchChart` — tylko bieżąca cena).
- API: `POST/GET /api/cfd`, `PATCH/DELETE /api/cfd/[id]`.
- UI: karta „Pozycje CFD" na stronie Portfel (tabela desktop + karty mobile) z przyciskiem „+ CFD" i modalem formularza; wkład P&L do nagłówka dashboardu (osobno opisany).

**Non-goals (świadomie pomijamy):**
- Wpięcie CFD w FIFO, koszty uzyskania, PIT-38, TWR/XIRR.
- Śledzenie depozytu zabezpieczającego (margin), punktów swap/odsetek finansowania, prowizji CFD — co najwyżej opcjonalne/nullable pole, nie liczone (raczej pomijamy w MVP).
- Historia ceny/wykres CFD (Yahoo `WIG20.WA` zwraca tylko bieżącą cenę, bez historii OHLC — patrz Ryzyka).
- Wliczanie CFD do wykresu historii wartości portfela (`portfolioValueHistory`) — brak historii ceny bazowej.
- Wielowalutowość CFD, wiele instrumentów naraz (model ogólny przez pole `quote_symbol`, ale UI/testy pod jedną pozycję WIG20).
- Automatyczne rolowanie/korekta bazy futures vs indeks kasowy (od tego jest ręczne nadpisanie „wg XTB").

## Podejście

**1. Osobna tabela, nie rozszerzenie `companies`.** CFD nie ma „ilości akcji", nie przechodzi przez FIFO, ma inne pola (kierunek, wartość punktu, cena otwarcia, override). Rozszerzanie `companies` zmusiłoby do wyjątków w `computePortfolio()`/PIT i mieszało dwa modele. Osobny byt `cfd_positions` (jak rekomendowane `bonds` w roadmapie 2.5) jest czystszy i trzyma CFD z dala od logiki podatkowej. Odrzucona alternatywa: „CFD jako INDEX company" — INDEX jest watch-only bez pozycji, a tu potrzebujemy pozycji z wolumenem i P&L.

**2. Źródło ceny — reużycie potoku Yahoo, ale własne pole ceny.** Tabele `quotes_latest`/`quotes_daily` są kluczowane po `company_id` (FK), więc nie nadają się wprost dla bytu bez `companies`. Zamiast tworzyć sztuczną spółkę, CFD trzyma **własny** `quote_symbol` (domyślnie `WIG20.WA`) oraz kolumny `quote_price` + `quote_updated_at`. W `refreshQuotes()` (`src/lib/quotes.ts`) po pętli spółek dokładamy pętlę po pozycjach CFD: `fetchChart(quote_symbol)` → `chart.price` → zapis do wiersza CFD. To reużywa `fetchChart()` z `src/lib/yahoo.ts` (guard `num()`, obsługa 404/429) i istniejący przycisk `RefreshQuotesButton` bez nowego route'a. `WIG20.WA` w `fetchChart` zwróci 1 świecę + `regularMarketPrice` — bierzemy tylko `price` (historii nie zapisujemy).

**3. Hybrydowy P&L jako czysta funkcja.** `src/lib/cfd.ts` → `computeCfdPositions()` czyta `cfd_positions` (wzorzec: `computePortfolio()` czyta DB bezpośrednio) i zwraca widoki z policzonym: `effectivePrice = override_price ?? quote_price`, `pnl = override_pnl ?? (effectivePrice − open_price) × sign × volume × pointValue`, `exposure = volume × effectivePrice × pointValue`, `pnlSource: 'XTB' | 'YAHOO' | 'NONE'` (NONE gdy brak ceny i brak override — P&L `null`). Suma `totalCfdPnlPln` z pozycji z policzonym P&L.

**4. Wkład do majątku = mark-to-market P&L, ekspozycja osobno.** CFD jest lewarowany — doliczanie ekspozycji do sumy portfela zawyżyłoby majątek wielokrotnie. Rekomendacja: do nagłówkowej „Wartości portfela" na dashboardzie dodać `totalCfdPnlPln` (niezrealizowany wynik CFD), z osobnym, opisanym wierszem/kaflem; ekspozycję pokazać **tylko** na karcie CFD jako informację (nie sumowaną). `computePortfolio()` zostaje nietknięte (czyste FIFO/PIT); łączenie następuje na poziomie strony (`src/app/page.tsx`, `src/app/portfolio/page.tsx`). To jest **decyzja do potwierdzenia** (patrz Pytania) — wariant alternatywny „margin + P&L" wymagałby śledzenia depozytu, którego nie zbieramy.

**Uwaga Next.js (reguła z `AGENTS.md` — to NIE jest Next.js z treningu).** Przed implementacją route handlerów i strony przeczytać:
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — sygnatura Route Handlerów (GET/POST/PATCH/DELETE).
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` — segment `[id]` (uwaga: `params` jest `Promise` — patrz istniejący `api/transactions/[id]/route.ts`, `ctx.params` jest `await`-owane).
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config` — `export const dynamic = "force-dynamic"` dla strony czytającej DB.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` — `router.refresh()` po zapisie (wzorzec z `TransactionForm.tsx`).

## Pliki do zmiany

**Baza:**
- `src/db/schema.ts` — nowa tabela Drizzle `cfdPositions` (`cfd_positions`) + `export type CfdPosition = typeof cfdPositions.$inferSelect`. Kolumny (propozycja):
  - `id` (PK autoincrement), `symbol TEXT` (etykieta, np. `WIG20`), `name TEXT` (np. „CFD WIG20"), `direction TEXT` (`LONG`/`SHORT`), `volume REAL` (loty), `openPrice REAL` (pkt), `pointValue REAL` (PLN/pkt na 1 lot), `quoteSymbol TEXT NOT NULL DEFAULT 'WIG20.WA'`, `openedAt TEXT` (YYYY-MM-DD), `overridePrice REAL` (nullable), `overridePnl REAL` (nullable), `quotePrice REAL` (nullable), `quoteUpdatedAt TEXT` (nullable), `note TEXT` (nullable), `createdAt TEXT`.
- `src/db/index.ts` — dopisać `CREATE TABLE IF NOT EXISTS cfd_positions (...)` do `BOOTSTRAP_SQL`. **Nowa tabela = sam CREATE w bootstrapie, bez ALTER/migracji** (wzorzec jak `note_attachments`, `company_logos`). NIE ruszać Proxy/lazy-init.

**Logika (reużycie):**
- `src/lib/cfd.ts` (NOWY) — `computeCfdPositions(): { positions: CfdView[]; totalCfdPnlPln: number }`. Czysta funkcja czytająca `db.select().from(cfdPositions)`. Reużyj typów z `@/db`. Bez FX (PLN). Wzory jak w Podejściu pkt 3.
- `src/lib/quotes.ts` — w `refreshQuotes()` po pętli spółek dodać pętlę po `cfd_positions`: **reużyj** `fetchChart` (`src/lib/yahoo.ts`) → zapis `quotePrice`/`quoteUpdatedAt` (reużyj `nowISO()` z `src/lib/format.ts`). Błąd per pozycja trafia do `result.errors` (jak przy spółkach). Ceny walut i tak liczone wcześniej — CFD w PLN, więc bez FX.

**API (wzorzec: `api/transactions`):**
- `src/app/api/cfd/route.ts` (NOWY) — `GET` (lista) + `POST` (walidacja: `direction ∈ {LONG,SHORT}`, `volume > 0`, `openPrice > 0`, `pointValue > 0`, `openedAt` w formacie RRRR-MM-DD; `overridePrice`/`overridePnl` opcjonalne). Wzór walidacji/odpowiedzi z `src/app/api/transactions/route.ts`. Opcjonalnie od razu dociągnąć cenę (`fetchChart`) best-effort — jak `POST /api/companies` robi `refreshQuotes`.
- `src/app/api/cfd/[id]/route.ts` (NOWY) — `PATCH` (częściowa aktualizacja pól, w tym czyszczenie override do `null`) + `DELETE`. Wzorzec: `src/app/api/transactions/[id]/route.ts` (`ctx.params` jako `Promise`, `await`).

**UI (reużycie komponentów z `src/components/ui.tsx`):**
- `src/components/CfdForm.tsx` (NOWY, `"use client"`) — `CfdModalButton` (dodawanie + edycja), wzorzec 1:1 z `src/components/TransactionForm.tsx`. Reużyj: `Modal` (`src/components/Modal.tsx`), `Button`, `Input`, `Label`, `Select` z `ui.tsx`; `useRouter().refresh()`. Pola: kierunek (Select LONG/SHORT), wolumen, cena otwarcia, wartość punktu (**domyślnie 20**), symbol notowań (domyślnie `WIG20.WA`), data, override kursu, override P&L, notatka. Domyślna nazwa pozycji: „CFD WIG20". `,`→`.` w liczbach (jak w `TransactionForm`).
- `src/app/portfolio/page.tsx` — nowa `Card title="Pozycje CFD"` z przyciskiem `CfdModalButton` w `PageHeader.actions`. Desktop: `Table`/`Th`/`Td`/`Delta`/`Badge`; mobile (`md:hidden`): karty z `Field`/`Delta` — **skopiuj wzorzec kartowy** z sekcji „Pozycje" tej samej strony (`hidden md:block` + `space-y-2 md:hidden`). Kolumny: Symbol/kierunek (Badge), Wolumen, Cena otwarcia, Kurs bieżący (+ znacznik źródła/„wg XTB"), Wartość punktu, Ekspozycja, Wynik P&L (`Delta`). Reużyj `DeleteButton` (`url="/api/cfd/{id}"`) i `CfdModalButton` do edycji. `EmptyState` gdy brak pozycji.
- `src/app/page.tsx` (dashboard) — doliczyć `totalCfdPnlPln` do nagłówkowej „Wartości portfela" **oraz** dodać opisany wiersz w sekcji „Ledger" (np. „Wynik CFD (mark-to-market)") + ewentualnie krótka nota o ekspozycji. Reużyj `LedgerRow`, `fmtSignedMoney`, `returnToneClass`. Wywołać `computeCfdPositions()` obok `computePortfolio()`.

**Bez zmian nawigacji:** CFD mieszka na istniejącej stronie Portfel — nie dodajemy pozycji w `src/components/nav.ts` (spójne z tym, że transakcje/dywidendy też są kartami Portfela).

## Kryteria akceptacji

- [ ] Można dodać pozycję CFD (LONG/SHORT, wolumen, cena otwarcia, wartość punktu, symbol) przez modal „+ CFD" na stronie Portfel; pojawia się na liście „Pozycje CFD".
- [ ] Po „Odśwież ceny" pozycja pokazuje bieżący kurs z Yahoo `WIG20.WA` i **żywy** szacowany P&L wg wzoru; znacznik źródła = „szacunek Yahoo".
- [ ] Ustawienie „wg XTB" (kurs lub P&L) nadpisuje szacunek (P&L override wygrywa nad wszystkim); znacznik zmienia się na „wg XTB".
- [ ] Ekspozycja (wartość nominalna) jest pokazana obok wyniku i **nie** jest sumowana do wartości portfela.
- [ ] Nagłówkowa „Wartość portfela" na dashboardzie zawiera niezrealizowany P&L CFD (mark-to-market), z osobnym opisanym wierszem w Ledger; PIT-38 i „Pozycje" (akcje) bez zmian.
- [ ] Edycja i usunięcie pozycji CFD działają (`PATCH`/`DELETE /api/cfd/[id]`), `router.refresh()` odświeża widok.
- [ ] Widok kartowy CFD czytelny na szerokości **360–390px** (weryfikacja w przeglądarce/preview), nie tylko tabela desktop.
- [ ] `npm run lint` i `npm run build` przechodzą (uwaga: build importuje trasy w wielu workerach — nowa tabela tylko przez `CREATE TABLE IF NOT EXISTS`, bez zapisów na poziomie modułu).
- [ ] Aplikacja odpala się; scenariusz end-to-end (dodanie → odświeżenie → override → usunięcie) działa w preview.

## Ryzyka

- **Przybliżenie futures vs indeks kasowy.** XTB wycenia CFD z FW20 (futures), a `WIG20.WA` to indeks kasowy — bieżący kurs będzie się różnił o bazę/rolowanie, więc szacowany P&L jest orientacyjny. Mitigacja: pole nadpisania „wg XTB" (kurs lub wprost P&L) + wyraźny znacznik/nota w UI. Nie próbujemy modelować bazy.
- **Brak historii `WIG20.WA` w Yahoo (pułapka empiryczna projektu).** Symbol zwraca tylko bieżącą cenę (1 świeca, brak OHLC) — wystarcza do żywego P&L, ale **nie** do wykresu historii. Dlatego CFD nie wchodzi do `portfolioValueHistory()` ani nie dostaje wykresu; nie zapisujemy `quotes_daily` dla CFD.
- **Ryzyko zawyżenia sumy przez ekspozycję.** Doliczenie wartości nominalnej (lewar) do majątku zawyżyłoby portfel wielokrotnie. Twardo: do sumy wchodzi **tylko** P&L; ekspozycja jest oznaczona jako niesumowana. Wymaga jasnego opisu w UI, by nie mylić z wartością pozycji.
- **Lazy DB init / równoległe workery build.** Nowa tabela musi iść przez `CREATE TABLE IF NOT EXISTS` w `BOOTSTRAP_SQL`; żadnych zapisów/ALTER na poziomie importu modułu (patrz komentarze w `src/db/index.ts` o `SQLITE_BUSY` przy `next build`). Nie wracać do eager-init.
- **Znak i jednostki wolumenu.** Błąd znaku (SHORT) lub jednostki wartości punktu odwróci/przeskaluje P&L. Mitigacja: jawny `sign = direction === 'SHORT' ? -1 : +1`, wartość punktu jako pole (PLN/pkt na 1 lot), plus możliwość natychmiastowego override „wg XTB" jako korekta.
- **429/404 z Yahoo przy odświeżaniu.** Reużyty `fetchChart` już rzuca czytelne błędy; pętla CFD w `refreshQuotes()` musi łapać błąd per pozycja do `result.errors` i nie wywalać całego odświeżania spółek.

## Decyzje domykające (potwierdzone przez użytkownika)

Runda pytań po planowaniu — wszystkie kwestie rozstrzygnięte, brak otwartych pytań:

1. **Wkład CFD do sumy portfela:** do nagłówkowej „Wartości portfela" na dashboardzie dolicza się **niezrealizowany P&L** (mark-to-market), z osobnym opisanym wierszem w Ledger; **ekspozycja pokazywana, ale NIE sumowana**. (Wariant „osobny kafel bez ruszania głównej liczby" odrzucony.)
2. **Wartość punktu:** pole formularza, **domyślnie 20 zł/pkt na 1 lot** (jak FW20), edytowalne przy dodawaniu pozycji. Użytkownik zweryfikuje faktyczną wartość w XTB (xStation → „i"/specyfikacja instrumentu `W20` → „Wartość punktu / wartość 1 lota"); domyślne 20 wystarcza, bo pole jest edytowalne — zmiana nie wymaga kodu.
3. **Nazwa w UI:** „CFD WIG20". Model danych wspiera wiele pozycji (lista + dodaj/edytuj/usuń), realny scenariusz to jedna pozycja.
4. **Bez wykresu / bez krzywej:** CFD nie dostaje wykresu i nie wchodzi do `portfolioValueHistory()` (`WIG20.WA` bez historii OHLC) — potwierdzone.
5. **Margin i swap:** poza zakresem MVP (nie śledzone, nie liczone) — potwierdzone.
6. **Waluta:** PLN, bez przeliczeń FX — potwierdzone.
