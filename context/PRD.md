# PRD — Invest Dashboard

Prywatny, działający wyłącznie lokalnie dashboard inwestycyjny jednego użytkownika: portfel akcji GPW/USA/ETF liczony metodą FIFO z przeliczeniem na PLN po kursach NBP, agregacja pod PIT-38, newsy z RSS (ESPI + portale finansowe), notatki researchowe i asystent AI przez OpenRouter.

## 1. Wizja i cel produktu

Jeden lokalny panel, który zastępuje arkusz kalkulacyjny i kilka otwartych kart przeglądarki:

- **Stan portfela na żywo** — pozycje z ręcznie wpisywanych transakcji, wycena po notowaniach Yahoo Finance, wszystko przeliczone na PLN po kursach NBP.
- **Poprawne liczby pod podatek** — FIFO, prowizje wliczane w koszt nabycia, kursy walut D-1 (zasada podatkowa), roczne podsumowanie przychód/koszt/dochód/podatek 19% + dywidendy — jako wyliczenie pomocnicze do PIT-38 (weryfikowane z PIT-8C od brokera).
- **Kontekst decyzyjny w jednym miejscu** — komunikaty ESPI i newsy z portali dopasowane do spółek z portfela/watchlisty, notatki researchowe w markdown, czat AI z kontekstem spółki (notowania, pozycja, newsy, notatki).

Produkt świadomie **nie** jest usługą webową: brak kont, brak chmury, brak telemetrii. Całość danych w jednym pliku SQLite (`data/invest.db`), aplikacja uruchamiana lokalnie na `localhost:3000`.

## 2. Użytkownik i kontekst użycia

- **Jeden użytkownik**: prywatny inwestor indywidualny inwestujący na GPW i rynkach USA (akcje + ETF-y), rozliczający się z polskim fiskusem (PIT-38). Bez krypto.
- **Model użycia**: aplikacja uruchamiana lokalnie (`npm run dev` / `npm run build && npm start`), otwierana w przeglądarce. Odświeżanie notowań i newsów wyłącznie ręczne (przyciski) — użytkownik decyduje, kiedy aplikacja łączy się z internetem.
- **Prywatność**: dane portfela (transakcje, dywidendy, notatki) nigdy nie opuszczają maszyny użytkownika, z jednym świadomym wyjątkiem — funkcje AI wysyłają kontekst spółki (dane spółki, notowanie, pozycja, 15 ostatnich newsów, 5 ostatnich notatek do 3000 znaków każda) do OpenRouter, tylko na jawne żądanie użytkownika (wysłanie wiadomości w czacie / kliknięcie „Generuj analizę AI").
- **Brak logowania**: aplikacja słucha na localhost, dostęp fizyczny do maszyny = dostęp do danych. To akceptowane założenie, nie luka.
- **Język**: całe UI po polsku (formatowanie liczb i dat `pl-PL`).
- **Kopia zapasowa**: kopia pliku `data/invest.db` (SQLite, WAL).

## 3. Zakres — wymagania funkcjonalne

Nawigacja (sidebar): Dashboard `/`, Portfel `/portfolio`, Watchlista `/watchlist`, Newsy `/news`, Research `/research`, Ustawienia `/settings` + Karta spółki `/companies/[id]` (linkowana z tabel i badge'y). Wszystkie strony renderowane server-side z `force-dynamic`; odczyty idą bezpośrednio z warstwy `src/lib/*` w server components, mutacje przez API routes (`src/app/api/*`) + `router.refresh()`.

### 3.1 Mechanizmy wspólne (dane rynkowe i waluty)

**Notowania — Yahoo Finance** (`src/lib/yahoo.ts`, `src/lib/quotes.ts`):

- Nieoficjalne API v8: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1=..&period2=..&interval=1d`. Zawsze `period1`/`period2` (nigdy `range=max`, które zwraca dane miesięczne mimo `interval=1d`); `period1=0` = pełna dzienna historia.
- Symbol Yahoo per spółka w kolumnie `quote_symbol`: GPW = ticker z sufiksem `.WA` (np. `PKN.WA`), USA = goły ticker (np. `AAPL`); sufiks podpowiadany automatycznie (`suggestQuoteSymbol`). Rynki: `GPW | US | OTHER`.
- Jedno zapytanie zwraca historię dzienną (OHLCV → `quotes_daily`, PK `company_id+date`, upsert) oraz bieżącą cenę `regularMarketPrice` + datę/godzinę notowania w strefie giełdy (`gmtoffset`) → `quotes_latest`.
- Odświeżanie inkrementalne: od ostatniej świecy minus 7 dni zakładki; przy pierwszym pobraniu pełna historia. `prevClose` wyliczany lokalnie z `quotes_daily` (ostatni close przed datą bieżącego notowania).
- Obsługa błędów per spółka: 404 → „Nieznany symbol", 429 → limit zapytań; błąd jednej spółki nie przerywa odświeżania pozostałych (`RefreshResult.errors`).
- Notowania opóźnione ~15 min (komunikowane w UI).

**Kursy walut — NBP** (`src/lib/nbp.ts`):

- API NBP, tabela A (kursy średnie), cache w tabeli `fx_rates` (PK `currency+date`); zapytania o zakresy dzielone na kawałki ~250 dni (limit API ~255 notowań); PLN = 1.
- Dwie semantyki, obie zaimplementowane rozdzielnie:
  - **D-1 (podatkowa)**: `getFxRateBefore` — ostatni kurs opublikowany *przed* datą transakcji/dywidendy; używany do kosztów, przychodów i dywidend w PLN.
  - **Bieżąca wycena**: `getFxRateOnOrBefore` / `getLatestFxRate` — ostatni znany kurs.
- `ensureFxRates` dociąga kursy od min(data pierwszej transakcji, data pierwszej dywidendy), minimum 730 dni wstecz (pod wykresy), z buforem −10 dni na dni wolne. Dociąganie przy odświeżaniu notowań oraz od razu przy dodaniu transakcji/dywidendy.
- Brak kursu dla waluty → ostrzeżenie w UI („Brak kursu NBP dla X — odśwież notowania…"), wartości PLN pokazywane jako „—", nie zera.

**Silnik portfela** (`src/lib/portfolio.ts`):

- **FIFO**: kupno tworzy lot z `costPerShare = cena + prowizja/akcję` i kursem D-1 zakupu; sprzedaż zdejmuje loty z przodu kolejki. Przychód ze sprzedaży = `ilość × cena − prowizja sprzedaży`. Wynik PLN liczony po kursach D-1 obu stron (koszt po kursie z dnia zakupu, przychód po kursie z dnia sprzedaży).
- Sprzedaż przekraczająca stan posiadania → ostrzeżenie w UI z liczbą nadmiarowych sztuk (nie crash, nie ujemna pozycja).
- Pozycja zamknięta (0 akcji) znika z holdingów, ale jej sprzedaże pozostają w zrealizowanych.
- **`computeYearlyTax`**: per rok kalendarzowy — przychód, koszty, dochód, podatek 19% (0 przy stracie, bez przenoszenia strat między latami) oraz dywidendy brutto PLN, podatek pobrany PLN i dopłata = `max(0; 19% × brutto − pobrany)`.
- **`portfolioValueHistory(days)`**: seria dzienna wartości portfela w PLN — sweep po unii dat świec wszystkich spółek; delty akcji aplikowane dla wszystkich transakcji z datą ≤ data świecy (transakcja w dzień bez notowań nie jest gubiona); ostatni znany close jako wycena; kursy walut wyszukiwane binarnie z cache.

### 3.2 Dashboard (`/`)

- 4 kafelki (PLN): **Wartość portfela** (+ koszt nabycia), **Dzisiaj** (zmiana dzienna kwotowo i %, liczona z `prevClose`), **Wynik niezrealizowany** (kwota + %), **Zrealizowane + dywidendy** (suma zamkniętych pozycji i dywidend brutto). Kafelki kolorowane wg znaku (zysk/strata/neutral).
- Wykres **wartości portfela z 12 miesięcy** (`portfolioValueHistory(365)`, lightweight-charts AreaChart).
- **Donut alokacji** po tickerach wg wartości PLN (recharts).
- **Ostatnie newsy** (8 pozycji, `listNews`) z badge'ami dopasowanych spółek linkującymi do kart spółek; link „wszystkie →" do `/news`.
- Przycisk „Odśwież notowania" (POST `/api/quotes/refresh`), informacja o czasie ostatniej aktualizacji notowań, ostrzeżenia silnika portfela (brak kursów NBP, nadsprzedaż).
- Pusty portfel → stan pusty z linkami do Portfela i Watchlisty.

### 3.3 Portfel (`/portfolio`)

- **Pozycje** (FIFO): ilość, średni koszt/akcję (z prowizją) w walucie spółki, bieżący kurs, zmiana dzienna %, wartość w walucie i w PLN, wynik niezrealizowany PLN + %. Sortowanie malejąco po wartości PLN.
- **Podsumowanie roczne (pod PIT-38)**: per rok — przychód ze sprzedaży, koszty, dochód, podatek 19%, dywidendy brutto, podatek pobrany, dopłata od dywidend; z zastrzeżeniem w UI o weryfikacji z PIT-8C.
- **Zrealizowane sprzedaże (FIFO)**: data, spółka, ilość, przychód i koszt w walucie, wynik w walucie i PLN.
- **Dywidendy**: data, spółka, brutto i podatek pobrany w walucie, brutto PLN, notatka; usuwanie pojedynczych wpisów (DELETE `/api/dividends/[id]`).
- **Transakcje**: pełna lista (kupno/sprzedaż, ilość, cena, prowizja, notatka), edycja (PATCH `/api/transactions/[id]`) i usuwanie (DELETE) pojedynczych wpisów.
- Akcje w nagłówku (modale): **+ Spółka** (POST `/api/companies` — ticker, nazwa, rynek, waluta, symbol Yahoo z autopodpowiedzią, aliasy, flaga watchlisty; po utworzeniu system od razu próbuje pobrać notowania, błąd pobrania nie blokuje utworzenia), **+ Transakcja** (walidacja: data `RRRR-MM-DD`, ilość > 0, cena ≥ 0; system od razu dociąga kursy NBP dla waluty), **+ Dywidenda** (kwota brutto + podatek pobrany w walucie spółki), **Odśwież notowania**.

### 3.4 Watchlista (`/watchlist`)

- Lista spółek z flagą `watchlist = 1` (niezależnie od posiadania pozycji): ticker + nazwa, rynek (badge), bieżący kurs w walucie, zmiana dzienna %, **licznik nieprzeczytanych newsów** dopasowanych do spółki (link do karty spółki), czas ostatniej aktualizacji notowania.
- Toggle obserwowania (gwiazdka, PATCH `/api/companies/[id]`) — zdjęcie z watchlisty nie usuwa spółki.
- Dodawanie spółki tym samym formularzem co w Portfelu, z domyślnie zaznaczoną watchlistą; notowania i newsy zbierane tak samo jak dla spółek portfelowych.

### 3.5 Karta spółki (`/companies/[id]`)

- Nagłówek: ticker + nazwa, badge rynku/waluty/symbolu Yahoo, czas aktualizacji notowania; akcje: toggle watchlisty, odświeżenie notowań, edycja spółki (PATCH, w tym aliasy do dopasowywania newsów).
- Kafelki: **Kurs** (z datą notowania), **Dzisiaj** (%), a przy otwartej pozycji **Pozycja** (ilość + średni koszt) i **Wynik pozycji** (PLN + %); bez pozycji — status „Obserwowana"/„Bez pozycji".
- **Wykres kursu** (lightweight-charts) z przełącznikiem zakresu **3M / 1R / 3L / MAX** (filtrowanie client-side; dane z `quotes_daily` do 5 lat wstecz).
- **Transakcje spółki** z dodawaniem/edycją/usuwaniem (modal z prewybraną spółką).
- **Newsy o spółce** (15 ostatnich dopasowanych) z przełącznikiem przeczytane/nieprzeczytane; pusta lista podpowiada mechanizm dopasowania (ticker/nazwa/aliasy) i dodanie dedykowanego źródła RSS.
- **Notatki spółki** (posortowane po dacie edycji) + link „+ Nowa notatka" (`/research/new?companyId=...`).
- **Asystent AI** — czat (patrz 3.7/AI): pytania o spółkę z automatycznie budowanym kontekstem, zapis ostatniej odpowiedzi jako notatka przypisana do spółki.

### 3.6 Newsy (`/news`, `src/lib/news.ts`)

- **Pobieranie**: POST `/api/news/refresh` iteruje po włączonych źródłach z `news_sources`; parser RSS 2.0 + Atom (fast-xml-parser, obsługa CDATA); per źródło zapisywane `last_fetched_at` i `last_error` (błąd jednego źródła nie przerywa reszty).
- **Deduplikacja**: `news_items.url` UNIQUE + `onConflictDoNothing` — ten sam URL nigdy nie jest wstawiony dwa razy.
- **Dopasowanie do spółek** (junction `news_company`, M:N) po tekście `tytuł + opis`: ticker jako osobne słowo (min. 3 znaki, granice słów przez `\p{L}` — działa z polskimi znakami), pełna nazwa spółki, aliasy rozdzielane przecinkami (pole `aliases` spółki, np. „Orlen,PKN Orlen"). Źródło przypisane do konkretnej spółki (`news_sources.company_id`) taguje nią wszystkie swoje wpisy.
- **Czyszczenie opisów**: `stripHtml` usuwa tagi/encje; specjalnie dla ESPI z Bankiera odcina ucięty surowy CSS (od pierwszej klamry `{`, cofając się po znakach selektora) i boilerplate „Spis treści… PODPISY OSÓB REPREZENTUJĄCYCH SPÓŁKĘ" / „Spis załączników"; opis przycinany do 500 znaków.
- **Domyślne źródła** (seedowane przy pustej tabeli, zweryfikowane w praktyce): Bankier ESPI (`bankier.pl/rss/espi.xml`), Bankier Giełda, Bankier Wiadomości, Strefa Inwestorów (`strefainwestorow.pl/rss.xml`).
- **Lista** (limit 150, sortowanie po dacie publikacji malejąco): tytuł (link zewnętrzny), opis (2 linie), źródło, data, badge'e dopasowanych spółek; filtry przez query params: spółka (`?company=id`) i tylko nieprzeczytane (`?unread=1`).
- **Stan przeczytania**: toggle per news i „Oznacz wszystkie jako przeczytane" (PATCH `/api/news`); DELETE `/api/news` czyści wszystkie newsy (np. po zmianie źródeł). Nieprzeczytane wyróżnione typograficznie.

### 3.7 Research (`/research`) i AI (`src/lib/ai.ts`)

- **Lista notatek**: tytuł, badge spółki (jeśli przypisana), snippet treści (180 znaków bez znaczników markdown), data edycji.
- **Edytor** (`/research/new`, `/research/[id]`): tytuł, opcjonalne przypisanie do spółki (notatka ogólna = `company_id NULL`), treść w markdown z przełącznikiem **Edycja / Podgląd** (react-markdown + remark-gfm: nagłówki, listy, tabele, linki).
- **„Generuj analizę AI"** (wymaga wybranej spółki): stały prompt (profil działalności, wnioski z newsów, mocne strony, ryzyka, katalizatory) wysyłany z kontekstem spółki; odpowiedź streamowana bezpośrednio do treści notatki pod nagłówkiem `## Analiza AI — TICKER (data)`, dopisywana do istniejącej treści.
- **Czat AI na karcie spółki**: historia wielu tur w ramach sesji, streaming odpowiedzi, zapis ostatniej odpowiedzi jako nowa notatka „Analiza AI — TICKER (data)" przypisana do spółki.
- **Backend AI**: POST `/api/ai/chat` — OpenRouter chat completions (`openrouter.ai/api/v1/chat/completions`), SSE passthrough do klienta (parsowanie strumienia w `src/lib/sse.ts`), `maxDuration 300`. System prompt: polski asystent researchu, bez porad inwestycyjnych w sensie prawnym, markdown. Kontekst spółki (`buildCompanyContext`): dane spółki, bieżące notowanie ze zmianą dzienną, pozycja z portfela, 15 ostatnich newsów, 5 ostatnich notatek (do 3000 znaków każda). Brak klucza API → czytelny błąd z odesłaniem do Ustawień.

### 3.8 Ustawienia (`/settings`)

- **AI — OpenRouter**: zapis klucza API i modelu (POST `/api/settings`; klucz przechowywany w tabeli `settings`, w UI i GET API tylko zamaskowany podgląd `pierwsze 8…ostatnie 4` znaki, nigdy pełny klucz). Domyślny model: `anthropic/claude-sonnet-4.5`.
- **Źródła newsów (RSS)**: lista z nazwą, URL, opcjonalnym przypisaniem do spółki, statusem ostatniego pobrania (`last_fetched_at` / `last_error`); dodawanie z **walidacją** (POST `/api/news-sources` pobiera i parsuje kanał przed zapisem — niedziałający URL jest odrzucany z komunikatem), włączanie/wyłączanie i usuwanie (`/api/news-sources/[id]`). Domyślne źródła seedują się przy pustej tabeli.
- **Dane**: informacja o lokalizacji bazy (`data/invest.db`), sposobie backupu (kopia pliku) i źródłach danych (Yahoo ~15 min opóźnienia, NBP tabela A, RSS).

### 3.9 Model danych (SQLite, `src/db/schema.ts` + bootstrap w `src/db/index.ts`)

| Tabela | Zawartość / klucze |
|---|---|
| `companies` | ticker, name, market (GPW/US/OTHER), currency, quote_symbol (Yahoo), watchlist (0/1), aliases (CSV), created_at |
| `transactions` | company_id (FK CASCADE), type BUY/SELL, date, quantity, price, commission (w walucie spółki), note; indeks (company_id, date) |
| `dividends` | company_id (FK CASCADE), date, amount (brutto, waluta spółki), tax_withheld, note |
| `quotes_latest` | PK company_id; price, prev_close, date, time, updated_at |
| `quotes_daily` | PK (company_id, date); OHLCV |
| `fx_rates` | PK (currency, date); kurs średni NBP |
| `news_sources` | name, url, company_id (NULL = globalne), enabled, last_fetched_at, last_error |
| `news_items` | source_id (FK SET NULL), title, **url UNIQUE**, summary, published_at, read, created_at |
| `news_company` | PK (news_id, company_id) — junction M:N |
| `notes` | company_id (FK **SET NULL** — notatki przeżywają usunięcie spółki), title, content (markdown), created_at, updated_at |
| `settings` | key/value (openrouter_api_key, openrouter_model) |

Schemat tworzony bootstrapem `CREATE TABLE IF NOT EXISTS` przy starcie (brak migracji); połączenie singleton przez `globalThis` (przeżywa HMR w dev); pragmy `journal_mode = WAL`, `foreign_keys = ON`. Usunięcie spółki kasuje kaskadowo jej transakcje, dywidendy, notowania i dopasowania newsów; notatki zostają jako ogólne.

## 4. Wymagania niefunkcjonalne

- **Lokalność**: aplikacja działa wyłącznie na maszynie użytkownika (`localhost:3000`); jedyne połączenia wychodzące to Yahoo Finance i api.nbp.pl (na kliknięcie „Odśwież notowania" lub dodanie spółki/transakcji), skonfigurowane kanały RSS (na „Pobierz newsy") i openrouter.ai (na jawne użycie AI). Zero telemetrii i zewnętrznych zależności runtime (fonty/CDN).
- **Prywatność**: dane inwestycyjne w lokalnym pliku SQLite; klucz OpenRouter przechowywany lokalnie w `settings` i maskowany w UI/API; do OpenRouter trafia wyłącznie kontekst spółki opisany w 3.7.
- **Brak logowania i wielodostępu**: jeden użytkownik, brak auth — świadome założenie dla localhost.
- **Odporność na brak sieci / błędy źródeł**: brak internetu nie psuje aplikacji — odczyty idą z cache w SQLite (notowania, kursy, newsy); błędy zewnętrznych API raportowane per spółka/źródło bez przerywania reszty; brak kursu NBP → ostrzeżenie i „—" zamiast błędnych zer.
- **Wydajność**: dane w skali jednego inwestora (dziesiątki spółek, setki transakcji) — better-sqlite3 synchronously in-process, upserty batchowane po 400 wierszy, `portfolioValueHistory` liczy rok historii jednym sweepem z binarnym wyszukiwaniem kursów; strony renderują się bez zauważalnych opóźnień. Timeouty zapytań zewnętrznych: Yahoo/RSS 20 s, NBP 15 s, OpenRouter 120 s.
- **Język i formatowanie**: całość UI po polsku; liczby, waluty i daty w formacie `pl-PL`; ciemny motyw (tokeny w `@theme` w `globals.css`, paleta dataviz).
- **Stack**: Next.js 16.2.10 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, better-sqlite3 + Drizzle ORM, lightweight-charts v5, recharts, react-markdown + remark-gfm, fast-xml-parser.
- **Utrzymywalność danych**: bootstrap idempotentny (`IF NOT EXISTS`), backup = kopia jednego pliku; klucze obce z jawnymi regułami kaskad.

## 5. Poza zakresem obecnej wersji

Świadomie wykluczone z v1 (kandydaci do roadmapy):

- **Kryptowaluty i obligacje** — tylko akcje GPW/USA i ETF-y.
- **Import CSV od brokerów** — transakcje wyłącznie ręczne.
- **Automatyczne odświeżanie** notowań/newsów (cron/scheduler) — tylko ręczne przyciski.
- **Alerty** cenowe i newsowe.
- **Testy automatyczne** — logika FIFO/PIT zweryfikowana ręcznie (patrz 6), bez suite'u testów.
- **Paginacja newsów** (stały limit 150) i **scalanie duplikatów treści** między feedami Bankiera (ten sam artykuł pod różnymi URL-ami to osobne wpisy).
- **Wykresy świecowe OHLC** (dane OHLC są w bazie, wykresy tylko liniowe) i **benchmarki** (WIG, S&P 500).
- **Spłity akcji** — brak obsługi; wymagają ręcznej korekty transakcji.
- **Śledzenie wpłat/gotówki i stopy zwrotu ważone czasem** (TWR/XIRR) — wykres wartości portfela nie odróżnia wpłat od wzrostu wyceny.
- **Eksport danych / PIT** (CSV, PDF).
- **Załączniki i wykresy w notatkach, RAG po notatkach**.
- **Wiele portfeli / multi-user / logowanie**.
- **Motyw jasny**, **Docker**.

## 6. Kryteria ukończenia v1 (zweryfikowane)

- [x] **Notowania**: pełna dzienna historia i bieżąca cena z Yahoo (GPW `.WA` i USA) jednym zapytaniem; obejście pułapki `range=max` (dane miesięczne) przez `period1/period2`; odświeżanie inkrementalne z 7-dniową zakładką; poprzedni Stooq porzucony (endpointy CSV martwe w 2026).
- [x] **Kursy NBP**: cache w `fx_rates`, chunkowanie ~250 dni, rozdzielone semantyki D-1 (podatek) i on-or-before (wycena).
- [x] **Silnik FIFO liczbowo potwierdzony**: zakup 100 szt. po 60 z prowizją 19, sprzedaż 30 szt. po 70 z prowizją 10 → zysk 284,30 zł, podatek 54,02 zł (zgodne z wyliczeniem ręcznym).
- [x] **Wykres wartości portfela**: naprawiony bug gubienia transakcji zawartej w dzień bez notowań (delty aplikowane dla wszystkich transakcji ≤ data świecy).
- [x] **PIT-38**: roczna agregacja przychód/koszty/dochód/podatek 19% + dywidendy (brutto, pobrany, dopłata `max(0, 19% − pobrany)`) widoczna w Portfelu.
- [x] **Newsy**: 4 domyślne źródła działają w praktyce (ESPI, Bankier ×2, Strefa Inwestorów; stockwatch.pl/rss = 404 i bankier.pl/rss/ebi.xml pusty — odrzucone); deduplikacja po URL; dopasowanie ticker/nazwa/aliasy z granicami słów Unicode; czyszczenie uciętego CSS i boilerplate'u ESPI z opisów Bankiera; walidacja nowego źródła przed zapisem.
- [x] **AI**: streaming SSE end-to-end (czat na karcie spółki i generowanie analizy do notatki), kontekst spółki budowany z bazy, klucz maskowany, domyślny model `anthropic/claude-sonnet-4.5`.
- [x] **CRUD kompletny**: spółki (z natychmiastowym pobraniem notowań po dodaniu), transakcje (dodawanie/edycja/usuwanie z walidacją), dywidendy, notatki, źródła RSS; stany puste z podpowiedziami na każdej stronie.
- [x] **Odporność**: ostrzeżenia zamiast błędnych liczb przy braku kursów NBP i nadsprzedaży; błędy per spółka/źródło nie przerywają odświeżania; baza przeżywa HMR (singleton przez `globalThis`).

---

*Data utworzenia: 2026-07-07. Dokument opisuje stan projektu na tę datę — przy rozbieżnościach źródłem prawdy jest kod w `src/`.*
