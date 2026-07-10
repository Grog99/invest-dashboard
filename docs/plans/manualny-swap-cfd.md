# Manualny swap dla pozycji CFD

> Plan wygenerowany przez skill `/plan-feature`. Slug: `manualny-swap-cfd`. Branch: `feature/manualny-swap-cfd`.

## Kontekst / Problem

Pozycje CFD (WIG20) zostały zaimplementowane w PR #16 wg `docs/plans/pozycja-cfd.md`. W tamtym MVP **swap był świadomie poza zakresem** (sekcja „Decyzje domykające" pkt 5: *„Margin i swap: poza zakresem MVP — nie śledzone, nie liczone — potwierdzone"*). W praktyce broker (XTB) nalicza codziennie punkty swap (koszt/przychód finansowania) od pozycji CFD trzymanej przez noc, a ten skumulowany koszt realnie zmienia wynik pozycji. Dziś dashboard go ignoruje, więc `Wynik P&L` i nagłówkowa „Wartość portfela" są zawyżone/zaniżone o narosły swap.

Potrzeba: dać użytkownikowi **jedno ręczne pole** na skumulowaną kwotę swapu w PLN (dodatnią lub ujemną), którą wpisze/zaktualizuje z brokera, i wliczyć ją do wyniku pozycji liczonego automatycznie z ceny — bez automatycznego naliczania dziennego, bez pól daty/stawki.

## Wymagania

**Funkcjonalne:**
- Nowe, opcjonalne pole liczbowe `swapPln` na pozycji CFD: skumulowana kwota swapu w PLN, **może być dodatnia lub ujemna**, domyślnie puste (`null`).
- Swap wchodzi do wyniku pozycji liczonego z ceny: `pnl = cenowy_pnl + swap`, gdzie `cenowy_pnl` to dotychczasowy wzór `(effectivePrice − openPrice) × sign × volume × pointValue`, a `effectivePrice = overridePrice ?? quotePrice`.
- Gdy użytkownik ustawił „P&L wg XTB" (`overridePnl` niepusty) — traktujemy to jako liczbę już finalną: **swap się NIE dolicza** w tej ścieżce.
- Skoro swap zmienia `pnl` w `computeCfdPositions()`, automatycznie wpływa na `totalCfdPnlPln`, a przez to na nagłówkową „Wartość portfela" i wiersz Ledger „Wynik CFD (mark-to-market)" na dashboardzie — bez dodatkowych zmian w tych widokach.
- UI: kolumna/pole „Swap" w tabeli desktop **i** w kartach mobile karty „Pozycje CFD" (obok kolumny „Wynik P&L"), plus pole w formularzu `CfdModalButton` (dodawanie i edycja).

**Niefunkcjonalne:**
- Kwota w PLN (spójnie z resztą modelu CFD — bez przeliczeń FX); formatowanie przez helpery z `src/lib/format.ts`.
- Responsywność mobilna: kolumna/pole „Swap" czytelne na ~360–390px (widok kartowy), nie tylko desktop (patrz `AGENTS.md` + `docs/plans/pwa-wersja-mobilna.md`).
- Dodanie kolumny do **istniejącej** tabeli `cfd_positions` bez zrywania leniwego initu bazy i bez `SQLITE_BUSY` przy równoległych workerach `next build` (patrz komentarze w `src/db/index.ts`).
- Istniejące pozycje bez swapu (kolumna `NULL`) zachowują się identycznie jak dziś — zero regresji.

## Zakres i Non-goals

**W zakresie:**
- Nowa nullowalna kolumna `swap_pln REAL` w tabeli `cfd_positions` (bootstrap `CREATE TABLE` dla świeżych baz + idempotentna migracja `ALTER TABLE ... ADD COLUMN` dla istniejących).
- Rozszerzenie czystej funkcji `computeCfdPositions()` (`src/lib/cfd.ts`) o doliczenie swapu w ścieżce liczonej z ceny.
- Rozszerzenie API `POST /api/cfd` i `PATCH /api/cfd/[id]` o walidację/zapis `swapPln`.
- Rozszerzenie formularza `CfdModalButton` i karty „Pozycje CFD" (tabela desktop + karty mobile) o pole/kolumnę „Swap".

**Non-goals (świadomie pomijamy):**
- Automatyczne naliczanie dziennego swapu w aplikacji (stawki broker/overnight, kalendarz, potrójny swap środowy). Pole jest w pełni ręczne — użytkownik wpisuje skumulowaną sumę z brokera.
- Osobne pola daty/stawki/waluty swapu, historia zmian swapu, rozbicie na koszt/przychód finansowania.
- Doliczanie swapu do wyniku, gdy ustawiony jest `overridePnl` („P&L wg XTB" jest liczbą finalną — patrz Wymagania).
- Wpływ swapu na ekspozycję (wartość nominalna liczona z ceny — swap jej nie dotyczy).
- Zmiana modelu FIFO/PIT-38 (CFD dalej poza `computePortfolio`/`computeYearlyTax`).

## Podejście

**1. Nullowalna kolumna `swap_pln REAL` — kalka istniejącego wzorca migracji kolumny.** `cfd_positions` to **istniejąca** tabela, więc samo dopisanie kolumny do `CREATE TABLE IF NOT EXISTS` w `BOOTSTRAP_SQL` obsłuży tylko świeże bazy; istniejąca baza użytkownika wymaga `ALTER TABLE`. Projekt ma na to ustalony, sprawdzony wzorzec — trzy istniejące migracje kolumn do tabeli `companies`: `migrateCompanyType` (z `NOT NULL DEFAULT`), `migrateCompanyDomain` i `migrateCompanyColor` (kolumny **nullowalne, bez DEFAULT/backfillu**). Nasz `swap_pln` jest nullowalny bez DEFAULT, więc jest **kalką 1:1 `migrateCompanyDomain`/`migrateCompanyColor`** — tylko na tabeli `cfd_positions` zamiast `companies`.

Kluczowe (SQLite + równoległe workery `next build`): `ALTER TABLE ADD COLUMN` w SQLite **nie ma `IF NOT EXISTS`**, a `next build` importuje trasy w wielu procesach roboczych, z których każdy woła `createDb()`. Wzorzec z `src/db/index.ts` rozwiązuje to dwustopniowo:
   - **Tani read-only guard** `needs…Migration()` = `PRAGMA table_info(cfd_positions)` sprawdza obecność kolumny bez otwierania transakcji zapisu (odczyty WAL nie rywalizują o blokadę) — pozwala pominąć zapis, gdy migracja już zrobiona.
   - **Re-check WEWNĄTRZ transakcji zapisu** — write-transakcje SQLite/WAL serializują się między procesami (kolejkują na `busy_timeout = 15000`), więc dopiero w transakcji mamy pewność, że inny worker nie dodał kolumny między naszym guardem a startem transakcji; bez tego drugi `ALTER TABLE` wywala się na `duplicate column name`.

   Odrzucona alternatywa: „tylko dopisać kolumnę do `CREATE TABLE`" — zadziała jedynie na świeżej bazie, a produkcyjna baza użytkownika (z pozycjami CFD z PR #16) nigdy nie dostanie kolumny i każdy `INSERT`/`SELECT` z `swap_pln` rzuci `no such column`.

**2. Swap doliczany tylko w gałęzi liczonej z ceny — jedna zmiana w `computeCfdPositions()`.** Logika P&L jest już poprawnie rozgałęziona (`src/lib/cfd.ts`): gałąź `overridePnl` (wygrywa nad wszystkim), gałąź `effectivePrice !== null` (wzór cenowy), gałąź `NONE`. Swap dokładamy **wyłącznie** w gałęzi cenowej (`(effectivePrice − openPrice) × sign × volume × pointValue + (swapPln ?? 0)`). Gałęzi `overridePnl` **nie** ruszamy (decyzja: to liczba finalna). Dzięki temu `totalCfdPnlPln` (suma `pnl`) i wszystkie widoki nad nim (nagłówek + Ledger na `src/app/page.tsx`) zaktualizują się **bez zmian w tych plikach** — potwierdzone lekturą `src/app/page.tsx` (linie ~245 `summary.totalValuePln + cfd.totalCfdPnlPln`, ~272 i ~396–398 używają wyłącznie `cfd.totalCfdPnlPln`).

**3. UI: reużycie `Delta` do swapu.** Swap bywa dodatni lub ujemny, więc naturalnie mapuje się na istniejący komponent `Delta` z `src/components/ui.tsx` — renderuje `fmtSignedMoney` z kolorem (`text-pos`/`text-neg`) i „—" dla `null`. To ten sam komponent, którego karta CFD używa już do kolumny „Wynik P&L", więc kolumna „Swap" będzie spójna wizualnie i sama obsłuży pusty stan.

**Uwaga Next.js (reguła z `AGENTS.md` — to NIE jest Next.js z treningu).** Route handlery `POST/PATCH` i strona są tylko **rozszerzane** (istnieją i działają od PR #16), więc nie zakładamy nowych API — wzorujemy się 1:1 na istniejącym kodzie w tych plikach. Gdyby pojawiła się wątpliwość co do sygnatury handlera/`ctx.params` (`Promise`), sprawdzić `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` i `.../dynamic-routes.md` (istniejący `src/app/api/cfd/[id]/route.ts` już poprawnie `await`-uje `ctx.params`).

## Pliki do zmiany

Wskazane niżej pliki grupuję w trzy warstwy napędzające orkiestrator `/implement-feature` (dane → backend → frontend). Wszystkie trzy warstwy są dotknięte — żadna nie dostaje `— brak —`.

**Baza (warstwa danych):** schema + migracja bootstrapu + czysta funkcja domenowa.

- `src/db/schema.ts` — w definicji `cfdPositions` (linie ~213–231) dodać nullowalną kolumnę:
  - `swapPln: real("swap_pln"),` (nullowalna, bez `.notNull()`, bez DEFAULT — analogicznie do `overridePrice`/`overridePnl`/`quotePrice` powyżej). Umieścić obok pól override (np. tuż po `overridePnl` lub przed `note`). Zaktualizować komentarz nad tabelą, że P&L cenowy dolicza swap. Typ `CfdPosition` (`$inferSelect`, linia ~244) zaktualizuje się automatycznie.
- `src/db/index.ts` — trzy zmiany, wzorowane na `migrateCompanyDomain`/`migrateCompanyColor`:
  1. W `BOOTSTRAP_SQL`, w `CREATE TABLE IF NOT EXISTS cfd_positions (...)` (linie ~150–166) dodać kolumnę `swap_pln REAL,` (nullowalna; np. po `override_pnl REAL,` albo przed `note TEXT,`) — dla świeżych baz.
  2. Dodać parę funkcji `needsCfdSwapMigration(sqlite)` (read-only guard: `PRAGMA table_info(cfd_positions)` → sprawdź brak kolumny `swap_pln`) + `migrateCfdSwap(sqlite)` (idempotentna migracja: **re-check kolumny WEWNĄTRZ `sqlite.transaction`**, potem `sqlite.exec("ALTER TABLE cfd_positions ADD COLUMN swap_pln REAL")`). Skopiować 1:1 strukturę i komentarze `needsCompanyDomainMigration` + `migrateCompanyDomain` (linie ~313–338) — jedyne różnice to nazwa tabeli (`cfd_positions`) i kolumny (`swap_pln`). Bez DEFAULT/backfillu, bo kolumna nullowalna.
  3. W `createDb()` (linie ~370–388) dopisać wywołanie `migrateCfdSwap(sqlite);` po istniejących `migrateCompany*` (po `migrateCompanyColor(sqlite);`, przed `return drizzle(...)`).
- `src/lib/cfd.ts` — w `computeCfdPositions()` (linie ~25–67) w gałęzi `else if (effectivePrice !== null)` (linie ~38–46) doliczyć swap do policzonego P&L: `pnl = (effectivePrice − openPrice) * sign * volume * pointValue + (position.swapPln ?? 0);`. Gałęzi `overridePnl` (linie ~34–37) **NIE** ruszać. `exposure` bez zmian (swap nie wchodzi do ekspozycji). Opcjonalnie rozważyć, czy w gałęzi `NONE` (brak ceny i brak override) swap sam z siebie ma dać `pnl` — patrz „Pytania". `totalCfdPnlPln` (reduce po `pnl`, linia ~65) zaktualizuje się sam.

**Backend (warstwa backend):** route handlery CFD (rozszerzenie istniejących).

- `src/app/api/cfd/route.ts` — w `POST` (linie ~21–111):
  - sparsować `swapPln` z `body` wzorem `overridePnl` (linie ~38–43): `undefined/null/"" → null`, inaczej `Number(body.swapPln)`. **Uwaga:** swap **może być ujemny**, więc walidacja to `Number.isFinite(swapPln)` (jak override, linie ~64–69), **nie** `> 0`.
  - dodać `swapPln` do `.values({...})` (linie ~73–88).
- `src/app/api/cfd/[id]/route.ts` — w `PATCH` (linie ~13–134) dodać obsługę `body.swapPln` wg wzorca `overridePnl` (linie ~98–111): `undefined` = nie dotykaj, `null`/`""` = wyczyść do `null`, liczba = ustaw po walidacji `Number.isFinite` (dozwolone ujemne). Bez zmian w `DELETE`.

**Frontend (warstwa frontend):** formularz + karta „Pozycje CFD" (widok kartowy mobile ~360–390px).

- `src/components/CfdForm.tsx` (`CfdModalButton`) — dodać:
  - stan `const [swapPln, setSwapPln] = useState(...)` inicjowany z `position?.swapPln` wzorem `overridePnl` (linie ~50–54: `!== null && !== undefined ? String(...) : ""`).
  - pole `Input` (`inputMode="decimal"`, `Label` „Swap (PLN)") — najlepiej w bloku „Nadpisanie wg XTB" lub w osobnym wierszu obok notatki; placeholder np. „skumulowany swap z brokera, może być ujemny". Reużyć `Input`/`Label` z `./ui`.
  - w `payload` (linie ~61–76) dodać `swapPln: swapPln.trim() === "" ? null : Number(swapPln.replace(",", "."))` (wzorzec `overridePnl`, obsługa `,`→`.`).
  - w resecie po dodaniu (linie ~85–91, gałąź `!position`) dodać `setSwapPln("")`.
- `src/app/portfolio/page.tsx` — karta „Pozycje CFD" (linie ~226–364):
  - **Desktop** (tabela, linie ~234–302): dodać `<Th right>Swap</Th>` przy nagłówku (obok „Wynik P&L", linia ~244) oraz `<Td right><Delta value={p.position.swapPln} /></Td>` w wierszu (obok komórki „Wynik P&L", linie ~286–288). `Delta` sam wyrenderuje „—" dla `null` i kolor dla +/−.
  - **Mobile** (karty, linie ~304–353): dodać `<Field label="Swap">` z `<Delta value={p.position.swapPln} />` w gridzie pól (linie ~327–342). Zweryfikować, że grid `grid-cols-2` (linia ~327) zostaje czytelny po dodaniu 7. pola na ~360–390px.
  - Rozważyć drobne dopisanie do noty pod tabelą (linie ~355–361), że „Wynik P&L zawiera swap" — patrz „Pytania". Reużyć `Delta`, `Field`, `fmtSignedMoney` (już importowane/dostępne).
- `src/app/page.tsx` (dashboard) — **bez zmian.** Zweryfikowane: nagłówkowa „Wartość portfela" (`summary.totalValuePln + cfd.totalCfdPnlPln`, ~245), badge „w tym CFD" (~272) i `LedgerRow` „Wynik CFD (mark-to-market)" (~396–398) czytają wyłącznie `cfd.totalCfdPnlPln`, który po zmianie w `src/lib/cfd.ts` zawiera swap automatycznie. (Wpis wymieniony jawnie, by potwierdzić brak potrzeby edycji — nie jest to warstwa `— brak —`, bo warstwa frontend ma inne zmiany powyżej.)

## Kryteria akceptacji

- [ ] Można dodać pozycję CFD ze swapem (np. `−12,50`) przez modal „+ CFD"; kwota zapisuje się i pokazuje w kolumnie/polu „Swap".
- [ ] Można wyedytować swap na istniejącej pozycji (`PATCH /api/cfd/[id]`), w tym wyczyścić do pustego (`null`); `router.refresh()` odświeża widok.
- [ ] W ścieżce liczonej z ceny (`overridePnl` puste) „Wynik P&L" = `cenowy_pnl + swap`, a nagłówkowa „Wartość portfela" i wiersz Ledger „Wynik CFD (mark-to-market)" na dashboardzie zmieniają się o kwotę swapu.
- [ ] Gdy `overridePnl` (P&L wg XTB) jest ustawiony — swap **NIE** zmienia wyniku pozycji ani sum (P&L wg XTB pozostaje liczbą finalną).
- [ ] Istniejąca pozycja bez swapu (`swap_pln = NULL`) liczy się identycznie jak przed zmianą (brak regresji); kolumna „Swap" pokazuje „—".
- [ ] Kolumna/pole „Swap" widoczne i czytelne w tabeli desktop **oraz** w kartach mobile na szerokości **360–390px** (weryfikacja w przeglądarce/preview).
- [ ] Migracja kolumny bezpieczna: na istniejącej bazie (z pozycjami CFD z PR #16) po starcie/buildzie kolumna `swap_pln` istnieje, `SELECT`/`INSERT` działa; `next build` z równoległymi workerami nie rzuca `SQLITE_BUSY` ani `duplicate column name` (read-only guard + re-check w transakcji zapisu, wzorzec `migrateCompanyDomain`).
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się; scenariusz end-to-end (dodanie ze swapem → wpływ na sumę → ustawienie override P&L znosi wpływ swapu → edycja/wyczyszczenie swapu → usunięcie) działa w preview.

## Ryzyka

- **Migracja kolumny do istniejącej tabeli (`SQLITE_BUSY`/`duplicate column`).** `cfd_positions` istnieje w produkcyjnej bazie, więc sam `CREATE TABLE` nie wystarczy — konieczna idempotentna migracja `ALTER TABLE`. Bez read-only guardu + re-checku wewnątrz transakcji zapisu równoległe workery `next build` dają `SQLITE_BUSY` lub drugi `ALTER` rzuca `duplicate column name`. Mitygacja: kalka `needsCompanyDomainMigration` + `migrateCompanyDomain` (nullowalna kolumna, bez DEFAULT), `busy_timeout = 15000` już ustawiony. **Nie** wracać do eager-init ani nie robić zapisów na poziomie importu modułu.
- **Znak swapu.** Swap bywa ujemny (koszt finansowania) częściej niż dodatni — walidacja `> 0` (jak dla `volume`/`openPrice`/`pointValue`) błędnie odrzuciłaby prawidłowy wpis. Twardo: walidacja `Number.isFinite` (jak `overridePrice`/`overridePnl`), dozwolone wartości ujemne i zero. UI/format przez `Delta`/`fmtSignedMoney` (obsługują znak i kolor).
- **Podwójne liczenie w gałęzi override.** Doliczenie swapu również w gałęzi `overridePnl` zawyżyłoby/zaniżyło „P&L wg XTB" (który u brokera już zawiera swap). Twardo: swap dokładany **wyłącznie** w gałęzi `effectivePrice !== null`; gałąź `overridePnl` nietknięta. Pokryte kryterium akceptacji.
- **Gęstość kart mobile.** Karta CFD ma już 6 pól w `grid-cols-2` + wiersz akcji; „Swap" to 7. pole. Na ~360px trzeba zweryfikować, że siatka się nie rozjeżdża (ewentualnie zostawić „Swap" jako pełny wiersz lub obok „Wynik P&L" w nagłówku karty). Weryfikacja w przeglądarce (wymóg `AGENTS.md`).

## Decyzje domykające (potwierdzone przez użytkownika)

Runda pytań po planowaniu — wszystkie kwestie rozstrzygnięte, brak otwartych pytań:

1. **Swap gdy brak ceny (gałąź `NONE`):** swap dolicza się **tylko** gdy jest policzony cenowy P&L (`effectivePrice !== null`). Bez ceny nadal `pnl = null` (kolumna „Swap" pokazuje wpisaną wartość, ale „Wynik P&L" zostaje „—" do czasu odświeżenia ceny lub ustawienia override).
2. **Etykieta w UI:** nagłówek kolumny/pola to „Swap" (bez dopisku „(PLN)"), spójnie z resztą nagłówków kolumn karty CFD.
3. **Nota informacyjna:** dodać krótkie zdanie do istniejącej noty pod tabelą CFD — „Wynik P&L zawiera skumulowany swap (poza ścieżką »wg XTB«)".
4. **Pozycja pola w formularzu:** „Swap" jako osobne pole blisko notatki, **poza** blokiem „Nadpisanie wg XTB" — to zwykły ręczny wpis, nie mechanizm override.
