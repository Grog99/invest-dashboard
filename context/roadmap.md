# Roadmapa — usprawnienia i nowe funkcjonalności

Uporządkowana lista propozycji rozwoju invest-dashboardu — od drobnych usprawnień po duże moduły — z opisem, wartością dla użytkownika, szacunkową złożonością (S = godziny, M = 1–3 dni, L = tydzień+) i zależnościami, dopasowana do istniejącej architektury (Next.js 16 App Router, SQLite/Drizzle, Yahoo Finance, NBP, OpenRouter).

**Legenda złożoności:** S — mała zmiana w 1–2 plikach; M — nowy moduł/tabela + UI; L — zmiana przekrojowa (silnik portfela, nowe podsystemy).

---

## 1. Szybkie usprawnienia (małe, duży zysk)

### 1.1 Scalanie duplikatów newsów między feedami ✅ ZROBIONE
- **Opis:** Ten sam artykuł Bankiera trafia do bazy wielokrotnie (feedy `gielda.xml` / `wiadomosci.xml` / `espi.xml` używają różnych URL-i, więc deduplikacja po `news_items.url UNIQUE` w `refreshNews()` w `src/lib/news.ts` go nie łapie). Rozwiązanie: przed insertem sprawdzać duplikat po znormalizowanym tytule + dacie publikacji (dzień), np. dodatkowa kolumna `dedup_key` (`lower(trim(title)) + '|' + published_at.slice(0,10)`) z indeksem UNIQUE i `onConflictDoNothing`; przy trafieniu dopisywać tylko brakujące dopasowania w `news_company`.
- **Wartość:** Czystsza lista newsów i mniej szumu w kontekście AI (`buildCompanyContext` bierze 15 ostatnich newsów — duplikaty wypychają unikalne treści).
- **Złożoność:** S
- **Zależności:** brak; migracja = `ALTER TABLE news_items ADD COLUMN dedup_key` + backfill w bootstrapie `src/db/index.ts`.

### 1.2 Paginacja / infinite scroll newsów ✅ ZROBIONE
- **Opis:** Strona `src/app/news/page.tsx` woła `listNews({ limit: 150 })` i ucina resztę. Dodać parametr `offset` (lub cursor po `published_at`) do `listNews()` w `src/lib/news.ts`, endpoint `GET /api/news` (dziś route ma tylko PATCH/DELETE) zwracający kolejną stronę JSON i kliencki komponent doładowujący przy scrollu.
- **Wartość:** Dostęp do pełnej historii newsów bez czyszczenia bazy; ważne po włączeniu harmonogramu odświeżania (baza szybko urośnie).
- **Złożoność:** S
- **Zależności:** brak; indeks `idx_news_published` już istnieje.

### 1.3 Wykres świecowy OHLC jako opcja ✅ ZROBIONE
- **Opis:** Tabela `quotes_daily` już przechowuje `open/high/low/close/volume` — dane są gotowe. W `src/components/charts/PriceChart.tsx` (lightweight-charts v5, dziś `AreaSeries`) dodać przełącznik linia/świece (`CandlestickSeries` + opcjonalnie `HistogramSeries` dla wolumenu), obok istniejących zakresów 3M/1R/3L/MAX.
- **Wartość:** Analiza techniczna na karcie spółki bez wychodzenia do zewnętrznych serwisów.
- **Złożoność:** S
- **Zależności:** brak — tylko frontend; trzeba przekazać pełne bary (dziś strona spółki może przekazywać tylko `date`+`close`).
- **Status (zrealizowane):** Dodano `src/components/charts/CandleChart.tsx` (nowy kliencki komponent, `CandlestickSeries` + `HistogramSeries` wolumenu na osobnej skali, kolory `--color-pos`/`--color-neg`) oraz przełącznik trybu Linia/Świece w `PriceChart.tsx` (obok istniejącego przełącznika zakresu, ten sam styl przycisków). `src/app/companies/[id]/page.tsx` przekazuje teraz pełne bary OHLCV zamiast samego `close`. `AreaChart.tsx` (współdzielony z dashboardem) pozostał bez zmian; bary z `null` OHLC degradują do świecy na poziomie `close`.

### 1.4 Auto-odświeżanie notowań co N minut przy otwartej karcie
- **Opis:** Kliencki hook (np. w `src/components/RefreshButtons.tsx` lub nowy `AutoRefresh.tsx` montowany w layoucie karty spółki/dashboardu): `setInterval` → `POST /api/quotes/refresh` z `{ companyIds: [id] }` (endpoint już przyjmuje listę id) → `router.refresh()`. Interwał konfigurowalny w tabeli `settings` (np. klucz `quotes_auto_refresh_minutes`, 0 = wyłączone); pauza gdy `document.hidden`.
- **Wartość:** Aktualne ceny bez klikania; niskie ryzyko limitów Yahoo (jedno zapytanie per spółka, obsługa 429 już jest w `src/lib/yahoo.ts`).
- **Złożoność:** S
- **Zależności:** brak; komplementarne do harmonogramu serwerowego (3.1).

### 1.5 Dopasowanie istniejących newsów po dodaniu spółki/aliasu
- **Opis:** Matching działa tylko przy insercie w `refreshNews()` — nowa spółka lub nowy alias nie „widzi" newsów już zapisanych w bazie. Dodać funkcję `rematchCompanyNews(companyId)` w `src/lib/news.ts` (przejście po `news_items.title + summary` z matcherami z `buildMatchers()`, insert do `news_company` z `onConflictDoNothing`) i wołać ją w `POST /api/companies` oraz w `PATCH /api/companies/[id]` gdy zmieniły się `ticker/name/aliases`.
- **Wartość:** Nowo dodana spółka od razu ma historię newsów; edycja aliasów naprawia dopasowania wstecz.
- **Złożoność:** S
- **Zależności:** brak; przy dużej bazie newsów warto ograniczyć do np. 5000 najnowszych.

### 1.6 Obsługa splitów akcji
- **Opis:** Split psuje FIFO (ilości i ceny lotów sprzed splitu są w starych jednostkach). Dwa warianty: (a) nowy typ transakcji `SPLIT` z ratio w `transactions` (kolumna `quantity` = mnożnik), obsłużony w `computePortfolio()` i `portfolioValueHistory()` w `src/lib/portfolio.ts` jako przemnożenie ilości i podzielenie `costPerShare` wszystkich otwartych lotów; (b) osobna tabela `stock_splits (company_id, date, ratio)`. Yahoo chart API zwraca zdarzenia splitów po dodaniu `&events=splits` do URL w `fetchChart()` (`src/lib/yahoo.ts`) — można podpowiadać wykryte splity.
- **Wartość:** Poprawne pozycje i koszty po splicie (bez tego kolumny ilość/średni koszt są błędne, a PIT-38 przy sprzedaży policzony źle).
- **Złożoność:** M
- **Zależności:** testy jednostkowe FIFO (6.1) mocno wskazane przed zmianą silnika.

### 1.7 Eksport CSV transakcji
- **Opis:** Endpoint `GET /api/transactions/export` zwracający CSV (`ticker,type,date,quantity,price,commission,currency,note`) z nagłówkiem `Content-Disposition: attachment`. Link „Eksportuj CSV" na stronie `src/app/portfolio/page.tsx`. Analogicznie dywidendy.
- **Wartość:** Backup danych wpisywanych ręcznie i możliwość analizy w Excelu; pierwszy krok do pełnego eksportu (7.1).
- **Złożoność:** S
- **Zależności:** brak.

---

## 2. Import i dane

### 2.1 Import CSV od brokerów (XTB, eMakler, Degiro)
- **Opis:** Kreator importu: upload pliku → parsowanie → podgląd zmapowanych wierszy → zapis do `transactions`/`dividends`. Formaty:
  - **XTB (xStation):** eksport „Historia rachunku" xlsx/csv — kolumny m.in. Symbol, Typ (BUY/SELL/dywidenda), Wolumen, Cena otwarcia, Prowizja; symbole z sufiksami (`.PL`, `.US`) do zmapowania na `companies.quote_symbol`.
  - **mBank eMakler:** CSV „Historia operacji" — polskie nagłówki, daty `DD.MM.YYYY`, przecinek dziesiętny, kwoty w PLN.
  - **Degiro:** `Transactions.csv` — kolumny Datum/Product/ISIN/Aantal/Koers; identyfikacja po ISIN (warto dodać kolumnę `isin` do `companies`).
  Deduplikacja po (companyId, date, type, quantity, price) — import można powtarzać bezpiecznie. Parser CSV: własny (formaty proste) lub `papaparse`.
- **Wartość:** Eliminuje najbardziej żmudną czynność — ręczne przepisywanie transakcji; umożliwia szybkie zasilenie historii wieloletniej.
- **Złożoność:** L (każdy broker to osobny adapter + walidacja formatów, które brokerzy zmieniają)
- **Zależności:** warto zacząć od jednego brokera faktycznie używanego; mapowanie tickerów wymaga ewentualnej kolumny `isin` w `companies`.

### 2.2 Śledzenie wpłat/wypłat i gotówki
- **Opis:** Nowa tabela `cash_flows (id, date, type DEPOSIT|WITHDRAWAL, amount, currency, note)` + sekcja w Portfelu (saldo gotówki = wpłaty − wypłaty − zakupy − prowizje + sprzedaże + dywidendy netto, per waluta). Zakupy/sprzedaże/dywidendy już są w bazie — dochodzi tylko rejestr wpłat.
- **Wartość:** Pełny obraz kapitału (dziś dashboard pokazuje tylko wartość akcji); warunek konieczny dla TWR/XIRR (2.3).
- **Złożoność:** M
- **Zależności:** brak; fundament dla 2.3.

### 2.3 Stopy zwrotu TWR i XIRR
- **Opis:** W `src/lib/portfolio.ts`: **XIRR** — metoda Newtona na przepływach (wpłaty/wypłaty z `cash_flows` + bieżąca wartość portfela jako przepływ końcowy); **TWR** — iloczyn stóp podokresów wyznaczanych przez daty przepływów, wartości portfela z istniejącego `portfolioValueHistory()`. Kafelki na dashboardzie: „TWR 1R / od początku", „XIRR".
- **Wartość:** Odpowiedź na kluczowe pytanie „ile naprawdę zarabiam w skali roku" — sam wynik niezrealizowany tego nie mówi, bo miesza kapitał dokładany w czasie.
- **Złożoność:** M (licząc na gotowym 2.2)
- **Zależności:** **wymaga 2.2**; dokładność zależy od kompletności historii wpłat.

### 2.4 Benchmark vs WIG / S&P 500 ✅ ZROBIONE
- **Opis:** Indeksy jako pseudo-spółki (wiersz w `companies` z `market='OTHER'`, `watchlist=1`, np. `quoteSymbol='^GSPC'` dla S&P 500 — działa w Yahoo chart API; symbole indeksów GPW w Yahoo, np. `WIG20.WA`, wymagają weryfikacji w `fetchChart()`) albo osobna tabela `benchmarks`. Na wykresie wartości portfela (dashboard, `AreaChart.tsx`) druga seria: portfel vs benchmark znormalizowany do 100 na początku zakresu.
- **Wartość:** Natychmiast widać, czy aktywna selekcja spółek bije proste ETF-y.
- **Złożoność:** M
- **Zależności:** sensowne porównanie stóp zwrotu wymaga TWR (2.3); sama nakładka indeksu na wykres — nie.

### 2.5 Obsługa obligacji / ETF-ów obligacyjnych
- **Opis:** ETF-y obligacyjne notowane na giełdzie działają już dziś (zwykły wiersz w `companies` z symbolem Yahoo). Prawdziwa luka to **detaliczne obligacje skarbowe (EDO/COI/TOS)** — brak notowań rynkowych. Model: tabela `bonds (id, series, type, purchase_date, face_value, qty, margin, capitalization)` + wycena syntetyczna (nominał + narosłe odsetki wg oprocentowania okresu — dla EDO inflacja + marża) doliczana do `totalValuePln` i do `portfolioValueHistory()`.
- **Wartość:** Kompletny obraz majątku dla posiadaczy obligacji detalicznych (częsty składnik polskich portfeli).
- **Złożoność:** L (osobny silnik wyceny, dane o inflacji do kapitalizacji EDO)
- **Zależności:** brak twardych; decyzja UX, czy obligacje mają osobną zakładkę czy wchodzą do Portfela.

### 2.6 Krypto przez CoinGecko (opcjonalne)
- **Opis:** Świadomie wyłączone z zakresu MVP. Gdyby wróciło: nowy `market='CRYPTO'` w `companies`, adapter `src/lib/coingecko.ts` (darmowe API: `/coins/{id}/market_chart?vs_currency=usd&days=max` — dzienne ceny bez klucza, limit ~10–30 req/min) zapisujący do tych samych `quotes_daily`/`quotes_latest`; FIFO i PIT-38 (kursy D-1 NBP) działają bez zmian, bo silnik operuje na walucie instrumentu.
- **Wartość:** Jeden dashboard na cały majątek — jeśli użytkownik kiedyś kupi krypto.
- **Złożoność:** M
- **Zależności:** brak; architektura quotes (interfejs „symbol → bary + cena") jest na to gotowa, warto ją domknąć przy okazji 6.7.

---

## 3. Automatyzacja i alerty

### 3.1 Harmonogram odświeżania (node-cron / Task Scheduler) ✅ ZROBIONE
- **Opis:** Dziś odświeżanie jest wyłącznie ręczne (przyciski w `RefreshButtons.tsx` → `POST /api/quotes/refresh`, `POST /api/news/refresh`). Dwa warianty:
  - **(a) node-cron w procesie Next:** plik `instrumentation.ts` w katalogu głównym (Next wywołuje `register()` przy starcie serwera) + singleton przez `globalThis` (ten sam wzorzec co `__investDb` w `src/db/index.ts`, żeby HMR nie dublował cronów). Harmonogram z tabeli `settings` (np. `cron_quotes='*/15 9-17 * * 1-5'`, `cron_news='*/30 * * * *'`), wywołujący bezpośrednio `refreshQuotes()` / `refreshNews()` z lib.
  - **(b) Windows Task Scheduler:** `schtasks` odpalający `curl -X POST http://localhost:3000/api/quotes/refresh` — zero kodu, ale działa tylko gdy serwer wstał.
  Wariant (a) jest lepszy: samowystarczalny i przenośny do Dockera (6.3).
- **Wartość:** Dashboard „sam się aktualizuje" — otwierasz i widzisz świeże dane; warunek dla alertów (3.2) i raportów (3.3).
- **Złożoność:** M
- **Zależności:** brak; UI konfiguracji w `src/app/settings/page.tsx`.

### 3.2 Alerty cenowe i newsowe
- **Opis:** Tabela `alerts (id, company_id, kind PRICE_ABOVE|PRICE_BELOW|PCT_DAY|NEWS, threshold, enabled, triggered_at)`. Ewaluacja na końcu `refreshQuotes()` (porównanie z `quotes_latest.price`/`prev_close`) i `refreshNews()` (nowy wpis w `news_company` dla spółki z alertem NEWS). Kanały powiadomień: toast systemowy Windows (`node-notifier` — działa z procesu Node lokalnie) i/lub e-mail (`nodemailer` + SMTP z `settings`); do tego pasek nieodczytanych alertów w UI (Sidebar). UI zarządzania: karta spółki + watchlista.
- **Wartość:** Nie trzeba pilnować kursów — dashboard sam woła, gdy PKN spadnie poniżej progu albo pojawi się ESPI obserwowanej spółki.
- **Złożoność:** M
- **Zależności:** **wymaga 3.1** (bez harmonogramu alert sprawdzi się tylko przy ręcznym odświeżeniu).

### 3.3 Cotygodniowy raport AI o portfelu
- **Opis:** Zadanie cron (np. niedziela 18:00): zbudować kontekst portfela (holdings + wyniki tygodnia z `quotes_daily` + nieprzeczytane newsy per spółka), wywołać `openrouterChat()` bez streamingu i zapisać wynik jako notatka (`notes` z `company_id NULL`, tytuł `Raport tygodniowy 2026-W28`). Raport pojawia się w Research; opcjonalnie e-mail (kanał z 3.2).
- **Wartość:** Regularny, automatyczny przegląd portfela — podsumowanie zmian, newsy do nadrobienia, rzeczy do sprawdzenia.
- **Złożoność:** M
- **Zależności:** **wymaga 3.1**; klucz OpenRouter już konfigurowany w `settings`.

---

## 4. AI i research

### 4.1 Automatyczne podsumowania newsów dnia per spółka
- **Opis:** Po `refreshNews()` (ręcznym lub z crona) grupować nowe wpisy po spółce (`news_company`) i dla spółek z ≥N nowymi newsami generować 2–3-zdaniowe podsumowanie przez `openrouterChat()`. Zapis: kolumna `ai_summary` w `news_items` lub dzienna notatka; ekspozycja na dashboardzie w sekcji „Ostatnie newsy".
- **Wartość:** Zamiast 30 nagłówków ESPI — jedno zdanie „co się dziś działo w spółce X"; realna oszczędność czasu przy kilkunastu spółkach.
- **Złożoność:** M
- **Zależności:** klucz OpenRouter; sensowne dopiero z harmonogramem (3.1); kosztuje tokeny — warto limitować do spółek z portfela/watchlisty.

### 4.2 RAG / embeddingi po notatkach i newsach
- **Opis:** Indeks wektorowy na `notes.content` (chunki ~500 tokenów) i `news_items.title+summary`: rozszerzenie **sqlite-vec** (ładowalne przez `better-sqlite3` `loadExtension()`, wpina się w istniejący `data/invest.db`) + endpoint embeddingów (OpenRouter nie serwuje embeddingów stabilnie — realnie OpenAI `text-embedding-3-small` z osobnym kluczem albo lokalny model przez `transformers.js`). `buildCompanyContext()` w `src/lib/ai.ts` zamiast „5 ostatnich notatek po 3000 znaków" dostaje k najbardziej trafnych chunków do pytania z czatu.
- **Wartość:** Czat AI odpowiada na bazie **całego** researchu, nie tylko ostatnich notatek; im więcej notatek, tym większa przewaga nad obecnym mechanizmem.
- **Złożoność:** L
- **Zależności:** drugi dostawca API (embeddingi) lub model lokalny; reindeksacja przy zapisie notatki (`POST/PATCH /api/notes`).

### 4.3 Porównywarka spółek
- **Opis:** Widok `/compare?ids=1,2,3`: tabela obok siebie (kurs, zmiana 1R z `quotes_daily`, pozycja w portfelu, liczba newsów 30 dni) + znormalizowany wykres kursów (istniejący `PriceChart` z wieloma seriami) + przycisk „Porównaj przez AI" sklejający `buildCompanyContext()` dla 2–3 spółek w jeden prompt.
- **Wartość:** Wsparcie decyzji „która z dwóch podobnych spółek" — typowy dylemat przy dokupowaniu.
- **Złożoność:** M
- **Zależności:** dane fundamentalne (P/E, przychody) wymagałyby dodatkowego źródła (nieoficjalne Yahoo `quoteSummary` v10 — kruche); wersja bez fundamentów działa na obecnych danych.

### 4.4 Import raportów okresowych PDF do kontekstu AI
- **Opis:** Upload PDF na karcie spółki → ekstrakcja tekstu (`pdf-parse`/`unpdf` w route handlerze) → zapis jako notatka typu „raport" powiązana z `company_id` (plik źródłowy w `data/attachments/`, patrz 5.1). `buildCompanyContext()` dołącza streszczenie raportu; pełny tekst dostępny dla RAG (4.2).
- **Wartość:** Czat AI zna faktyczne liczby ze sprawozdań, nie tylko nagłówki ESPI — jakościowa zmiana głębokości analizy.
- **Złożoność:** M (samo wyciągnięcie tekstu) / L (z chunkowaniem pod RAG)
- **Zależności:** limit kontekstu → praktycznie potrzebuje streszczania przez AI lub RAG (4.2); załączniki (5.1) jako miejsce składowania.

### 4.5 Scraping stron IR per spółka
- **Opis:** `news_sources.company_id` już wspiera źródła przypisane do spółki (wszystkie wpisy taggowane tą spółką) — najtańszy wariant to **znajdowanie kanałów RSS na stronach IR** i dodawanie ich jako źródła per spółka (zero nowego kodu). Pełny scraping HTML = nowa kolumna `type RSS|HTML` + `selector` w `news_sources` i parser (fetch + regex/`node-html-parser`) emitujący `FeedItem[]` do istniejącego potoku insertów.
- **Wartość:** Komunikaty spółek, które nie przechodzą przez ESPI/portale (prezentacje wynikowe, transkrypcje calli).
- **Złożoność:** S (wariant RSS) / L (scraping HTML — każdy serwis IR to inny markup, kruche selektory)
- **Zależności:** brak dla RSS; dla HTML — utrzymanie selektorów po redesignach stron.

---

## 5. Notatki

### 5.1 Załączniki i obrazy ✅ ZROBIONE
- **Opis:** Tabela `note_attachments (id, note_id, filename, mime, size, created_at)`, pliki na dysku w `data/attachments/{id}` (obok `data/invest.db` — spójne z lokalnym charakterem aplikacji), endpointy `POST /api/notes/[id]/attachments` (multipart) i `GET /api/attachments/[id]`. Obrazy wstawiane do markdownu jako `![](/api/attachments/123)` — `Markdown.tsx` wyrenderuje je bez zmian.
- **Wartość:** Zrzuty wykresów, tabele ze sprawozdań i screeny prezentacji w treści researchu.
- **Złożoność:** M
- **Zależności:** backupy (6.4) powinny objąć też `data/attachments/`.

### 5.2 Osadzone wykresy w notatkach ✅ ZROBIONE
- **Opis:** Własna dyrektywa w markdownie, np. blok ` ```chart PKN.WA 1R ``` ` — override komponentu `code` w `src/components/Markdown.tsx` (react-markdown na to pozwala), renderujący istniejący `PriceChart` z danymi z `quotes_daily` dla wskazanego symbolu.
- **Wartość:** Teza inwestycyjna z żywym wykresem zamiast martwego screena; wykres aktualizuje się sam.
- **Złożoność:** M
- **Zależności:** dane muszą być w `quotes_daily` (spółka dodana do aplikacji); podgląd wymaga przekazania danych z serwera do klienckiego komponentu markdown.

### 5.3 Tagi notatek
- **Opis:** Tabele `tags (id, name)` + `note_tags (note_id, tag_id)` (wzorzec jak `news_company`), filtr po tagu na liście `src/app/research/page.tsx`, input tagów w `NoteEditor.tsx`. Tagi typu `teza`, `wyniki-Q`, `makro`, `do-sprawdzenia`.
- **Wartość:** Nawigacja po rosnącej bazie researchu — dziś jedyny podział to spółka/ogólne.
- **Złożoność:** S
- **Zależności:** brak.

### 5.4 Wersjonowanie notatek
- **Opis:** Tabela `note_revisions (id, note_id, content, saved_at)` — snapshot poprzedniej treści przy każdym `PATCH /api/notes/[id]` (z limitem np. 50 rewizji/notatkę); podgląd historii i przywracanie w `NoteEditor.tsx`.
- **Wartość:** Ochrona przed przypadkowym nadpisaniem (szczególnie że „Generuj analizę AI" streamuje **do treści** notatki) + ślad ewolucji tezy inwestycyjnej w czasie.
- **Złożoność:** S
- **Zależności:** brak.

### 5.5 Szablony tez inwestycyjnych
- **Opis:** Predefiniowane szkielety markdown (Teza / Katalizatory / Ryzyka / Wycena / Warunki wyjścia) wybierane przy tworzeniu notatki w `src/app/research/new/page.tsx`. Wariant minimalny: stałe w kodzie; rozszerzony: tabela `note_templates` edytowalna w Ustawieniach.
- **Wartość:** Dyscyplina procesu — każda pozycja ma spisaną tezę i warunki wyjścia; świetnie współgra z czatem AI („oceń moją tezę").
- **Złożoność:** S
- **Zależności:** brak.

---

## 6. Jakość i infrastruktura

### 6.1 Testy jednostkowe FIFO / PIT-38 (krytyczne)
- **Opis:** Vitest + testy czystych funkcji: `computePortfolio()` (FIFO: częściowe zdejmowanie lotów, prowizja w koszcie nabycia, sprzedaż ponad stan → warning), `computeYearlyTax()` (19%, dopłata od dywidend `max(0, 19%*brutto − pobrany)`), `getFxRateBefore()` (D-1 przez weekend), `portfolioValueHistory()` (transakcja w dzień bez notowań), `parseFeed()`/`stripHtml()` (ucięty CSS Bankiera). Zweryfikowany przypadek referencyjny do utrwalenia w teście: kupno 100 szt. po 60 z prowizją 19, sprzedaż 30 szt. po 70 z prowizją 10 → zysk **284,30 zł**, podatek **54,02 zł**. Uwaga architektoniczna: funkcje w `src/lib/portfolio.ts` czytają DB bezpośrednio — najprościej testować na tymczasowej bazie SQLite in-memory z bootstrapem z `src/db/index.ts` (albo wydzielić czysty rdzeń przyjmujący dane jako argumenty).
- **Wartość:** To jest logika **podatkowa** — błąd oznacza źle policzony PIT-38. Testy są też warunkiem bezpiecznego dotykania silnika (splity 1.6, straty 7.2, TWR 2.3).
- **Złożoność:** M
- **Zależności:** brak; blokuje/de-ryzykuje 1.6, 2.3, 7.2, 7.3.

### 6.2 Testy E2E
- **Opis:** Playwright na kluczowe ścieżki: dodanie spółki (mock Yahoo przez `page.route()` lub stub fetcha), wpisanie transakcji BUY/SELL, weryfikacja pozycji i tabeli PIT-38, dodanie źródła RSS z walidacją. Baza testowa przez zmienną środowiskową na ścieżkę `data/` (dziś zahardkodowana w `src/db/index.ts` — drobny refactor: `process.env.DATA_DIR`).
- **Wartość:** Regresje UI wykrywane automatycznie; przy aplikacji bez żadnych testów każda zmiana to dziś ślepy strzał.
- **Złożoność:** M
- **Zależności:** sensowne po 6.1 (piramida testów od dołu).

### 6.3 Docker + deployment na home serverze ✅ ZROBIONE (Coolify + Pangolin, lipiec 2026)
- **Opis:** Multi-stage `Dockerfile` (`node:22-bookworm-slim`; `better-sqlite3` ma natywny moduł — w obrazie budowanym od zera potrzebne `python3 make g++`, albo `output: 'standalone'` w `next.config` i kopiowanie zbudowanych artefaktów), wolumen na `data/` (baza + WAL + załączniki). Compose z labelami Traefika; **koniecznie** middleware autoryzacji (basicauth/forward-auth) + posiadany plugin `geoblock` (PascalMinder/geoblock v0.3.2) — aplikacja nie ma żadnego logowania, bo była projektowana na localhost; klucz OpenRouter leży w tabeli `settings`.
- **Wartość:** Dostęp z telefonu/laptopa w LAN i przez VPN/domenę; serwer działa ciągle → harmonogram (3.1) faktycznie chodzi 24/7.
- **Złożoność:** M
- **Zależności:** parametryzacja `DATA_DIR`; **warstwa auth przed wystawieniem poza localhost** (twardy wymóg).
- **Status (zrealizowane):** Zamiast surowego Traefika — deployment przez **Coolify**, a publiczny dostęp + auth zapewnia **Pangolin (SSO na brzegu)**, więc middleware autoryzacji/geoblock w Coolify nie jest potrzebny (aplikacja osiągalna wyłącznie przez Pangolina, w Coolify tylko internal host-port bez publicznej domeny). Dodano: `Dockerfile` (multi-stage standalone, non-root, healthcheck), `.dockerignore` (wyklucza `data`), `next.config.ts` (`output:'standalone'` + `outputFileTracingIncludes` na natywny `.node`), `src/app/api/health/route.ts`, oraz parametryzację `DATA_DIR` z env w `src/db/index.ts:7` (fallback `cwd/data`). Wolumen montowany na `/app/data`. Build zweryfikowany Dockerem end-to-end (native binary obecny, dane tylko w wolumenie, `/api/health` → 200). Pozostaje po stronie użytkownika: utworzenie nowego repo + konfiguracja resource w Coolify/Pangolin.

### 6.4 Automatyczne backupy bazy
- **Opis:** `better-sqlite3` ma wbudowane `db.backup(path)` (bezpieczne przy WAL, online) — zadanie cron (z 3.1) zapisujące `data/backups/invest-YYYY-MM-DD.db` z retencją np. 30 kopii, opcjonalnie kopia na inny dysk/chmurę. Wariant bez crona: backup przy starcie serwera raz dziennie. Objąć też `data/attachments/` po wdrożeniu 5.1.
- **Wartość:** Cała historia transakcji i researchu jest w **jednym pliku** wpisywanym ręcznie — jego utrata jest niereprodukowalna. Najtańsza polisa w całej roadmapie.
- **Złożoność:** S
- **Zależności:** najlepiej z 3.1, ale działa i samodzielnie.

### 6.5 Motyw jasny ✅ ZROBIONE
- **Opis:** Tokeny kolorów siedzą w `@theme` w `src/app/globals.css` (Tailwind v4) — dodać wariant jasny pod `prefers-color-scheme: light` lub klasę `data-theme` przełączaną w Ustawieniach (klucz w `settings`). Uwaga na komponenty wykresów: `PriceChart`/`AreaChart` (lightweight-charts) i `AllocationDonut` (recharts) mają kolory przekazywane w JS — muszą czytać zmienne CSS lub dostawać motyw propsem.
- **Wartość:** Komfort przy pracy dziennej; niżej na liście, bo paleta ciemna była walidowana jako podstawowa.
- **Złożoność:** M (głównie przez wykresy)
- **Zależności:** brak.

### 6.6 PWA / wersja mobilna ✅ ZROBIONE
- **Opis:** `manifest.json` + ikony + serwisowalny layout (Sidebar → dolna nawigacja na wąskich ekranach; tabele portfela → karty). Service worker opcjonalny (dane i tak wymagają sieci do localhost/servera).
- **Wartość:** Szybki podgląd portfela z telefonu — realnie użyteczne dopiero po 6.3 (dostęp spoza localhost).
- **Złożoność:** M
- **Zależności:** **6.3** (bez deploymentu PWA na localhost nie ma sensu).

### 6.7 Drugi provider notowań jako fallback
- **Opis:** Yahoo to nieoficjalne API (już raz „ugryzło": `range=max` zwraca dane miesięczne; Stooq umarł całkiem — projekt był na nim i został przepisany). Wydzielić interfejs `QuoteProvider { fetchChart(symbol, from): ChartResult }` w `src/lib/quotes.ts` i dodać zapasowego providera: **Twelve Data** (darmowe 800 req/dzień, ma GPW) lub **Alpha Vantage** (25 req/dzień — mało) z mapowaniem symboli (kolumna `alt_symbol` w `companies` lub konwencja). Fallback per spółka przy błędzie/429 Yahoo, klucz API w `settings`.
- **Wartość:** Odporność na dzień, w którym Yahoo zmieni/zamknie endpoint — dla aplikacji, której rdzeń to notowania, to ryzyko egzystencjalne.
- **Złożoność:** M
- **Zależności:** klucz API zewnętrznego serwisu; refactor `refreshCompany()` w `src/lib/quotes.ts`.

---

## 7. PIT-38

### 7.1 Eksport zestawienia do PDF/CSV
- **Opis:** Endpoint `GET /api/tax/export?year=2026&format=csv|pdf` generujący: podsumowanie roczne (dane z `computeYearlyTax()` — przychód, koszty, dochód, podatek 19%, dywidendy brutto/pobrany/dopłata) + szczegóły per sprzedaż (`realizedSales`: data, ilość, przychód PLN, koszt PLN po kursach D-1) i per dywidenda (`dividendRows`). CSV — kilka linii kodu; PDF — `pdfkit` lub `@react-pdf/renderer`, układ pod pola PIT-38 (sekcja C: poz. przychód/koszty; dywidendy zagraniczne pod PIT/ZG).
- **Wartość:** Gotowy podkładka do rozliczenia rocznego i dokumentacja na wypadek kontroli — zamiast ręcznego spisywania z ekranu.
- **Złożoność:** S (CSV) / M (PDF)
- **Zależności:** poprawność liczb → testy 6.1; wartościowe rozszerzenie po 7.2 i 7.3.

### 7.2 Obsługa strat z lat ubiegłych
- **Opis:** `computeYearlyTax()` liczy dziś każdy rok niezależnie — strata nie pomniejsza dochodu lat kolejnych. Reguła ustawowa: stratę można rozliczać przez **5 kolejnych lat**, w jednym roku maks. **50% straty z danego roku** (albo jednorazowo do 5 mln zł). Implementacja: iteracja po latach rosnąco z rejestrem niewykorzystanych strat per rok źródłowy + nowe pola w `YearlyTaxRow` (`lossCarryforwardUsed`, `taxAfterLosses`); ewentualnie wpis w `settings`/nowa tabela na straty sprzed użycia aplikacji.
- **Wartość:** Realnie niższy (poprawny) podatek po roku ze stratą — dziś aplikacja zawyża zobowiązanie.
- **Złożoność:** M
- **Zależności:** **testy 6.1 przed zmianą** (logika podatkowa); UI w tabeli rocznej w `src/app/portfolio/page.tsx`.

### 7.3 Limit odliczenia podatku u źródła wg umów o unikaniu podwójnego opodatkowania
- **Opis:** Obecne `divTaxDuePln = max(0, 19% * brutto − pobrany)` odlicza **cały** podatek pobrany za granicą — a wolno odliczyć tylko do stawki z umowy (dla USA 15%; przy szwajcarskim 35% u źródła odliczalne jest 15%, reszta do odzyskania u tamtejszego fiskusa, dopłata w PL i tak 4%). Implementacja: stawka umowna per kraj — mapa `market/kraj → stawka` (kolumna `treaty_rate` w `companies` lub słownik w `settings`); wzór per dywidenda: `dopłata = 19% * brutto − min(pobrany, treaty_rate * brutto)`, agregacja w `computeYearlyTax()`.
- **Wartość:** Poprawna dopłata dla dywidend zagranicznych — dziś przy podatku u źródła > 15% aplikacja zaniża zobowiązanie (błąd na niekorzyść fiskusa = ryzyko odsetek).
- **Złożoność:** M
- **Zależności:** **testy 6.1**; pole kraju emitenta (dziś tylko `market` GPW/US/OTHER — dla US wystarcza, dla OTHER trzeba doprecyzować kraj).

---

## 8. Priorytetyzacja — TOP 10 (wartość vs nakład)

| # | Pozycja | Sekcja | Wartość | Nakład | Uzasadnienie |
|---|---------|--------|---------|--------|--------------|
| 1 | Testy jednostkowe FIFO/PIT-38 | 6.1 | bardzo wysoka | M | Logika podatkowa bez testów; odblokowuje bezpiecznie 1.6, 2.3, 7.2, 7.3 |
| 2 | Automatyczne backupy bazy | 6.4 | bardzo wysoka | S | Dane ręcznie wpisywane, jeden plik — utrata niereprodukowalna |
| 3 | Scalanie duplikatów newsów | 1.1 | wysoka | S | Codzienna irytacja; poprawia też kontekst AI |
| 4 | Harmonogram odświeżania (node-cron w `instrumentation.ts`) | 3.1 | wysoka | M | Fundament automatyzacji: alerty, raporty, backupy z crona |
| 5 | Rematch newsów po dodaniu spółki/aliasu | 1.5 | wysoka | S | Mała zmiana, usuwa zaskakującą lukę w matchingu |
| 6 | Limit odliczenia podatku u źródła (umowy) | 7.3 | wysoka | M | Obecny wzór może zaniżać podatek — błąd merytoryczny |
| 7 | Alerty cenowe i newsowe | 3.2 | wysoka | M | Zamienia dashboard z „sprawdzam" na „jestem informowany" |
| 8 | Eksport CSV transakcji + zestawienia PIT | 1.7 + 7.1 | średnia–wysoka | S | Backup + gotowiec do rozliczenia, tanie w budowie |
| 9 | Wpłaty/gotówka + TWR/XIRR | 2.2 + 2.3 | wysoka | M–L | Jedyna rzetelna odpowiedź „ile zarabiam"; największy skok jakości analityki |
| 10 | Auto-odświeżanie przy otwartej karcie | 1.4 | średnia | S | Szybki komfort do czasu wdrożenia pełnego harmonogramu |

**Poza TOP 10, ale strategiczne:** drugi provider notowań (6.7 — ubezpieczenie od śmierci Yahoo, jak wcześniej Stooq), obsługa splitów (1.6 — zrobić najpóźniej przed pierwszym splitem spółki z portfela), import CSV brokera (2.1 — największa oszczędność czasu, ale też największy nakład), ~~Docker za Traefikiem (6.3 — dopiero z warstwą auth)~~ → ✅ zrobione przez Coolify + Pangolin.

---

*Dokument utworzony 2026-07-07. Opisuje stan projektu i propozycje rozwoju na tę datę — priorytety warto rewidować po każdej większej iteracji.*
