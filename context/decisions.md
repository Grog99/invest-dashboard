# Rejestr decyzji architektonicznych (ADR)

Rejestr kluczowych decyzji architektonicznych projektu invest-dashboard — prywatnego, lokalnego dashboardu inwestycyjnego (GPW + USA + ETF-y) — wraz z kontekstem, uzasadnieniem i konsekwencjami każdej z nich.

---

## ADR-001: Aplikacja lokalna zamiast hostowanej

**Kontekst.** Dashboard obsługuje dokładnie jednego użytkownika i przechowuje wrażliwe dane finansowe: pełną historię transakcji, dywidendy, wyliczenia podatkowe PIT-38 oraz klucz API OpenRouter (tabela `settings`, plaintext).

**Decyzja.** Aplikacja działa wyłącznie lokalnie pod `http://localhost:3000` (`next dev` / `next start`). Brak uwierzytelniania, brak HTTPS, brak deploymentu — świadomie, na wyraźne życzenie użytkownika.

**Uzasadnienie.**
- Prywatność: dane portfela i klucz API nigdy nie opuszczają maszyny użytkownika (poza zapytaniami do Yahoo/NBP/RSS/OpenRouter).
- Zero kosztów: brak hostingu, domeny, certyfikatów, bazy w chmurze.
- Brak auth = mniej kodu; model zagrożeń „jeden użytkownik na własnym komputerze" nie wymaga logowania.

**Konsekwencje.**
- Nagłówek `HTTP-Referer: http://localhost:3000` jest na sztywno wpisany w kliencie OpenRouter (`src/lib/ai.ts`).
- Aplikacji NIE wolno wystawiać publicznie bez dodania warstwy auth — API routes (np. `POST /api/settings`) są całkowicie otwarte.
- Brak dostępu z telefonu / innych urządzeń; ewentualny Docker + reverse proxy odłożone do roadmapy.

---

## ADR-002: Next.js + SQLite w jednym pliku

**Kontekst.** Potrzebny stack łączący UI (dashboard, wykresy, formularze) z lokalną persystencją, bez osobnego serwera bazy danych.

**Decyzja.** Next.js 16.2.10 (App Router, Turbopack) + React 19 + TypeScript jako fullstack; SQLite przez `better-sqlite3` jako jedyna baza — pojedynczy plik `data/invest.db` z włączonym WAL i `foreign_keys = ON` (`src/db/index.ts`).

**Uzasadnienie.**
- Jeden proces `next dev` uruchamia całość — frontend, API routes i dostęp do bazy.
- `better-sqlite3` jest synchroniczny, co upraszcza kod server components i logikę portfela (brak `await` na każdym zapytaniu).
- Backup = kopia jednego pliku `data/invest.db` (przy WAL warto kopiować też `-wal`/`-shm` lub zrobić checkpoint). Zero administracji bazą.

**Konsekwencje.**
- Baza jest singletonem trzymanym w `globalThis.__investDb`, żeby przeżyć hot-reload w dev (HMR nie resetuje `globalThis`).
- Synchroniczne zapytania blokują wątek — akceptowalne przy jednym użytkowniku, nieskalowalne na hosting wielodostępny.
- Migracja na Postgres wymagałaby przepisania warstwy `src/db` i wszystkich synchronicznych `.get()/.all()/.run()`.

---

## ADR-003: Drizzle ORM + bootstrap SQL zamiast systemu migracji

**Kontekst.** Drizzle Kit oferuje pełny system migracji (pliki migracji, journal, `drizzle-kit migrate`). Dla lokalnej, jednoosobowej aplikacji to dodatkowa maszyneria.

**Decyzja.** Schemat jest utrzymywany podwójnie: typowany w `src/db/schema.ts` (Drizzle ORM do zapytań) oraz jako stała `BOOTSTRAP_SQL` w `src/db/index.ts` — seria `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` wykonywana przy każdym starcie procesu. Brak plików migracji (`drizzle-kit` jest w devDependencies, ale nieużywany w runtime).

**Uzasadnienie.**
- `CREATE TABLE IF NOT EXISTS` jest idempotentne — świeża instalacja i restart działają identycznie, bez kroku „uruchom migracje".
- Jedna baza, jeden użytkownik, brak środowisk (dev/staging/prod) — wersjonowanie migracji nie rozwiązuje żadnego realnego problemu.

**Konsekwencje.**
- Zmiana istniejącej tabeli (nowa kolumna, zmiana typu) wymaga ręcznego `ALTER TABLE` na `data/invest.db` albo skasowania bazy — `IF NOT EXISTS` nie aktualizuje istniejących tabel.
- Ryzyko rozjazdu `schema.ts` ↔ `BOOTSTRAP_SQL` — obie definicje trzeba zmieniać razem.
- Tabele: `companies`, `transactions`, `dividends`, `quotes_latest`, `quotes_daily` (PK `company_id+date`), `fx_rates` (PK `currency+date`), `news_sources`, `news_items` (UNIQUE `url`), `news_company` (junction M:N), `notes`, `settings` (key/value).

---

## ADR-004: Yahoo Finance zamiast Stooq (i period1/period2 zamiast range)

**Kontekst.** Wymóg: darmowe notowania dla GPW, rynków USA i ETF-ów. Projekt zaczynał na Stooq (`stooq.pl`), ale w 2026 r. jego endpointy CSV (`q/l`, `q/d/l`) zwracają 404 lub JS-challenge anty-botowy — źródło praktycznie martwe dla dostępu programistycznego.

**Decyzja.** Notowania pochodzą z nieoficjalnego API Yahoo Finance v8: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1=..&period2=..&interval=1d` (`src/lib/yahoo.ts`). Mapowanie symboli: GPW = sufiks `.WA` (np. `PKN.WA`), USA/ETF = goły ticker (np. `AAPL`) — funkcja `suggestQuoteSymbol()`. Świadomie używamy `period1`/`period2` zamiast parametru `range`.

**Uzasadnienie.**
- Jedno API pokrywa GPW + USA + ETF-y; jedno zapytanie zwraca naraz pełną historię dzienną, `regularMarketPrice`, walutę i `gmtoffset` (daty liczone w strefie giełdy).
- **Pułapka odkryta podczas budowy:** `range=max` zwraca dane MIESIĘCZNE mimo `interval=1d`. Rozwiązanie: `period1=0` (epoch) daje pełną historię dzienną, `period2=now+86400` — bieżącą sesję. Komentarz ostrzegawczy przy `fetchChart()`.
- Odświeżanie inkrementalne (`src/lib/quotes.ts`): od `max(quotes_daily.date)` minus 7 dni zakładki, upsert `onConflictDoUpdate` po PK `(company_id, date)`; `prev_close` liczony z ostatniego `close` w `quotes_daily` przed datą notowania.

**Konsekwencje.**
- API jest nieoficjalne: wymagany nagłówek `User-Agent` przeglądarki, obsłużone kody 404 (zły symbol) i 429 (rate limit); Yahoo może w każdej chwili zmienić zachowanie.
- Yahoo potrafi zwrócić dwa bary z tą samą datą (sesja bieżąca) — deduplikacja przez `Map` po dacie, wygrywa ostatni wpis.
- Brak wsparcia dla splitów akcji (ceny z Yahoo są adjusted, ilości w transakcjach nie) — w roadmapie.

---

## ADR-005: OpenRouter zamiast bezpośredniego API jednego providera

**Kontekst.** Funkcje AI (czat na karcie spółki, generowanie analiz w Research) wymagają dostępu do LLM. Do wyboru: bezpośrednie API jednego dostawcy (Anthropic/OpenAI) albo agregator.

**Decyzja.** Integracja przez OpenRouter (`https://openrouter.ai/api/v1/chat/completions`, format zgodny z OpenAI chat completions) — `src/lib/ai.ts`. Klucz (`openrouter_api_key`) i model (`openrouter_model`, domyślnie `anthropic/claude-sonnet-4.5`) konfigurowane w Ustawieniach, przechowywane w tabeli `settings`. Wybór użytkownika.

**Uzasadnienie.**
- Jeden klucz API = dostęp do modeli wielu dostawców; zmiana modelu to edycja pola tekstowego w UI, zero zmian w kodzie.
- Streaming: endpoint `POST /api/ai/chat` robi passthrough SSE z OpenRouter do klienta; parsowanie eventów w `src/lib/sse.ts`.
- Kontekst spółki budowany deterministycznie w `buildCompanyContext()`: dane spółki + ostatnie notowanie + pozycja z portfela + 15 ostatnich newsów + 5 ostatnich notatek (do 3000 znaków każda).

**Konsekwencje.**
- Marża OpenRouter na tokenach (niewielka) i dodatkowy pośrednik w łańcuchu danych.
- `GET /api/settings` maskuje klucz przed wysłaniem do UI; klucz w bazie leży jawnie (akceptowalne przy ADR-001).
- Timeout zapytania 120 s (`AbortSignal.timeout`); brak retry — błąd wraca do UI.

---

## ADR-006: FIFO + kursy NBP D-1 (zgodność z PIT-38)

**Kontekst.** Wynik portfela musi być rozliczalny zgodnie z polskim prawem podatkowym: metoda FIFO dla kosztu nabycia, przeliczenie walut po średnim kursie NBP z ostatniego dnia roboczego poprzedzającego transakcję (D-1), prowizje wliczane w koszt uzyskania przychodu.

**Decyzja.** Silnik w `src/lib/portfolio.ts`:
- FIFO: każde kupno tworzy lot z `costPerShare = cena + prowizja/akcję` i kursem D-1 z dnia zakupu (`fxBuy`); sprzedaż zdejmuje z przodu kolejki; przychód = `qty * cena − prowizja sprzedaży`; strony transakcji przeliczane na PLN po własnych kursach D-1.
- Kursy z API NBP (tabela A) cache'owane w `fx_rates` (`src/lib/nbp.ts`); zapytania dzielone na kawałki ~250 dni (limit NBP ~255 notowań). `getFxRateBefore()` = ostatni kurs opublikowany PRZED datą transakcji (zasada podatkowa); `getFxRateOnOrBefore()`/`getLatestFxRate()` = bieżąca wycena.
- `computeYearlyTax()`: per rok przychód/koszty/dochód + podatek 19% (0 przy stracie) oraz dywidendy: brutto, podatek pobrany u źródła, dopłata = `max(0, 19% * brutto − pobrany)`.

**Uzasadnienie.** FIFO + kurs D-1 + prowizje w koszcie nabycia to dokładnie metodologia PIT-38; przechowywanie kursu D-1 w locie (a nie liczenie post-hoc) gwarantuje, że koszt PLN sprzedawanego lotu używa kursu z dnia JEGO zakupu.

**Konsekwencje.**
- Weryfikacja liczbowa (potwierdzona ręcznie): kupno 100 szt. po 60 z prowizją 19, sprzedaż 30 szt. po 70 z prowizją 10 → zysk 284,30 zł, podatek 54,02 zł.
- Brak kursu NBP nie wywala obliczeń: wartości PLN stają się `null`, a `warnings` w `PortfolioSummary` proszą o odświeżenie notowań.
- Brak kompensacji strat z lat ubiegłych i limitu 50% (strata rozliczana przez 5 kolejnych lat, maks. 50% straty z danego roku w jednym roku albo jednorazowo do 5 mln zł — por. roadmap 7.2; uproszczenie — tabela roczna to pomoc, nie deklaracja).
- `portfolioValueHistory(days)` (wykres 12 mies.) robi sweep po unii dat świec; delty akcji aplikowane dla wszystkich transakcji z datą `<=` data świecy (naprawiony bug: transakcja w dzień bez notowań była gubiona przy dopasowaniu po dokładnej dacie); kursy walut wyszukiwane binarnie w posortowanym cache.

---

## ADR-007: Transakcje wpisywane ręcznie zamiast importu CSV (v1)

**Kontekst.** Brokerzy (XTB, mBank, Degiro itd.) eksportują historię w niekompatybilnych formatach CSV. Automatyczny import wymagałby parserów per broker, mapowania kolumn i deduplikacji.

**Decyzja.** W v1 transakcje (BUY/SELL: data, ilość, cena, prowizja, notatka) i dywidendy (kwota brutto, podatek pobrany) wpisuje się ręcznie przez formularze; zapis przez `POST /api/transactions` i `POST /api/dividends`. Wybór użytkownika.

**Uzasadnienie.** Portfel indywidualnego inwestora to dziesiątki, nie tysiące transakcji — ręczne wprowadzenie jest jednorazowym kosztem; parsery CSV per broker to duży, kruchy kod o niepewnej wartości w v1.

**Konsekwencje.**
- Import CSV jest pierwszą pozycją roadmapy; schemat `transactions` (typ, data, ilość, cena, prowizja) jest gotowy na przyszły import bez zmian.
- Ryzyko literówek użytkownika; silnik ostrzega przy sprzedaży przekraczającej stan posiadania („sprzedaż … przekracza posiadane akcje").

---

## ADR-008: Odczyty w server components bez warstwy API; mutacje przez API + router.refresh()

**Kontekst.** App Router pozwala czytać dane bezpośrednio w server components — klasyczna architektura „strona → fetch → API route → DB" dublowałaby kod przy lokalnej, synchronicznej bazie.

**Decyzja.** Strony (np. `src/app/page.tsx`, `portfolio/page.tsx`) są server components z `export const dynamic = "force-dynamic"` i wołają funkcje z `src/lib/*` bezpośrednio (`computePortfolio()`, `listNews()`, …). Mutacje idą przez API routes w `src/app/api/*` (companies, transactions, dividends, quotes/refresh, news, news/refresh, news-sources, notes, settings, ai/chat), po czym klient woła `router.refresh()`, co ponownie renderuje server components ze świeżymi danymi.

**Uzasadnienie.**
- Mniej kodu: zero endpointów GET-owych dla stron, zero fetchy, zero stanów ładowania dla odczytów; synchroniczny `better-sqlite3` czyni odczyt w render czystą funkcją.
- `force-dynamic` wyłącza cache Next.js — dane zawsze aktualne po `router.refresh()`.
- API routes zostają tam, gdzie są niezbędne: mutacje z client components, streaming SSE (`/api/ai/chat`), operacje sieciowe (`/api/quotes/refresh`, `/api/news/refresh`).

**Konsekwencje.**
- Brak publicznego API odczytu danych (nie da się np. pobrać portfela skryptem bez czytania SQLite) — akceptowalne dla single-usera.
- Każda mutacja wymaga pary „endpoint + `router.refresh()` w komponencie klienckim"; łatwo zapomnieć o refresh (stan strony byłby nieaktualny).
- `POST /api/companies` po utworzeniu spółki od razu woła `refreshQuotes([id])`, żeby karta spółki miała dane bez dodatkowego kliknięcia.

---

## ADR-009: Newsy z RSS zamiast scrapingu HTML

**Kontekst.** Wymóg: komunikaty ESPI + newsy z portali finansowych. Alternatywy: scraping HTML portali/stron IR spółek albo konsumpcja kanałów RSS/Atom.

**Decyzja.** Wyłącznie RSS 2.0 i Atom, parsowane `fast-xml-parser` (`src/lib/news.ts`). Domyślne, zweryfikowane w praktyce źródła (`DEFAULT_SOURCES`, seedowane gdy tabela `news_sources` pusta): `bankier.pl/rss/espi.xml`, `bankier.pl/rss/gielda.xml`, `bankier.pl/rss/wiadomosci.xml`, `strefainwestorow.pl/rss.xml`. Deduplikacja po `UNIQUE url` (`onConflictDoNothing`). Nowe źródło jest walidowane przy dodawaniu — `POST /api/news-sources` robi fetch + parse przed zapisem.

**Uzasadnienie.**
- Stabilność: RSS to kontrakt maszynowy; scraping HTML psuje się przy każdym redesignie portalu.
- Legalność: kanały RSS są publikowane do konsumpcji programistycznej; scraping bywa wprost zabroniony w regulaminach.
- Zweryfikowane negatywnie: `stockwatch.pl/rss` = 404, `bankier.pl/rss/ebi.xml` zwraca pustą treść — stąd nie ma ich w domyślnych źródłach.

**Konsekwencje.**
- Scraping stron IR spółek odłożony do roadmapy — spółki bez RSS są poza zasięgiem.
- Konieczny workaround na brud w danych: Bankier w opisach ESPI zostawia UCIĘTY surowy CSS bez tagów `<style>` — `stripHtml()` tnie tekst od pierwszej klamry `{` (cofając się po znakach selektora) i usuwa boilerplate „Spis treści… PODPISY OSÓB REPREZENTUJĄCYCH SPÓŁKĘ".
- Duplikaty merytoryczne między feedami Bankiera (ten sam artykuł pod różnymi URL-ami) nie są scalane — deduplikacja działa tylko po identycznym URL.

---

## ADR-010: Ciemny motyw wg zwalidowanej palety dataviz

**Kontekst.** Dashboard finansowy to głównie liczby, delty i wykresy — kolory muszą być czytelne, spójne między UI a wykresami (lightweight-charts, recharts) i rozróżnialne dla osób z zaburzeniami widzenia barw (CVD).

**Decyzja.** Jeden, ciemny motyw. Tokeny kolorów zdefiniowane w bloku `@theme` w `src/app/globals.css` (Tailwind CSS v4): tło `--color-bg: #0d0d0d`, powierzchnie `#1a1a19`/`#232321`, krawędzie `#2c2c2a`/`#383835`, tekst `#ffffff`/`#c3c2b7`/`#898781`, akcent `--color-accent: #3987e5` (+ `accent-deep #1c5cab`), delta dodatnia `--color-pos: #0ca30c`, ujemna `--color-neg: #e66767`, ostrzeżenie `--color-warn: #fab219`. Paleta pochodzi ze zwalidowanego systemu dataviz (kontrast + bezpieczeństwo CVD).

**Uzasadnienie.**
- Zielony `#0ca30c` i czerwony `#e66767` dobrane tak, by różniły się także jasnością — para pos/neg pozostaje rozróżnialna przy deuteranopii.
- Jedno źródło prawdy o kolorach: te same zmienne CSS konsumuje Tailwind (klasy `bg-surface`, `text-pos` itd.) i komponenty wykresów.
- Ciemne tło to standard terminali finansowych i preferencja użytkownika.

**Konsekwencje.**
- Brak motywu jasnego (w roadmapie); wprowadzenie go wymaga tylko drugiego zestawu wartości tokenów, bo kod używa wyłącznie zmiennych.
- Kolory wykresów w komponentach (`AreaChart`, `AllocationDonut`) muszą czytać wartości z tej samej palety — dodając serię, sięgamy po tokeny, nie hex-y ad hoc.

---

## ADR-011: Dopasowanie newsów do spółek regułowe (ticker/nazwa/aliasy) zamiast AI

**Kontekst.** Każdy wpis RSS trzeba przypisać do spółek z bazy (junction `news_company`), żeby działały filtry i sekcja newsów na karcie spółki. Klasyfikacja LLM-em byłaby możliwa, ale płatna i niedeterministyczna.

**Decyzja.** Dopasowanie czysto regułowe w `buildMatchers()`/`matchCompanies()` (`src/lib/news.ts`), na tekście `tytuł + summary`:
- ticker jako osobne słowo, min. 3 znaki, regex z granicami Unicode: `(?<![\p{L}\d])TICKER(?![\p{L}\d])`, flagi `iu`;
- pełna nazwa spółki (substring, case-insensitive, min. 3 znaki);
- aliasy z kolumny `companies.aliases` (rozdzielane przecinkami, każdy min. 3 znaki);
- dodatkowo: źródło przypisane do spółki (`news_sources.company_id`) taguje spółką wszystkie swoje wpisy bezwarunkowo.

**Uzasadnienie.**
- Koszt zero i pełny determinizm — ten sam wpis zawsze dostaje te same tagi; brak zależności od klucza API przy odświeżaniu newsów.
- Minimalna długość 3 znaki i granice słowa dla tickerów eliminują fałszywe trafienia krótkich symboli (np. 2-literowych) wewnątrz zwykłych wyrazów; `\p{L}` obsługuje polskie znaki.
- Kolumna `aliases` daje użytkownikowi ręczną dźwignię na odmiany nazwy („Orlen, PKN Orlen").

**Konsekwencje.**
- Brak rozumienia kontekstu: wzmianka „lepszy niż Orlen" taguje Orlen tak samo jak news o samym Orlenie; spółki o nazwach będących pospolitymi słowami wymagają ostrożnych aliasów.
- Dopasowanie wykonywane tylko przy insercie wpisu — dodanie spółki lub aliasu nie otagowuje wstecznie starych newsów.
- Ewentualna klasyfikacja AI może w przyszłości uzupełniać (nie zastępować) reguły, np. tylko dla wpisów bez żadnego dopasowania.

---

*Dokument utworzony 2026-07-07. Opisuje stan projektu na tę datę — przy zmianach w kodzie kod jest ostatecznym źródłem prawdy.*
