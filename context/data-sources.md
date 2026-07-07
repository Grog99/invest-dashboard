# Źródła danych

Dokument operacyjny opisujący wszystkie zewnętrzne źródła danych dashboardu (Yahoo Finance, NBP, kanały RSS, OpenRouter) — z naciskiem na pułapki odkryte podczas budowy, których ponowne odkrywanie kosztuje godziny.

## Yahoo Finance — notowania

Klient: `src/lib/yahoo.ts`, orkiestracja odświeżania: `src/lib/quotes.ts`. Nieoficjalne, niedokumentowane API — brak klucza, brak gwarancji stabilności.

### Endpoint i parametry

```
GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={epoch}&period2={epoch}&interval=1d
```

- `period1` / `period2` — zakres w sekundach uniksowych. `period1=0` = pełna dzienna historia od początku notowań. `period2` ustawiamy na `now + 86400` (dzień do przodu), żeby objąć bieżącą sesję.
- `interval=1d` — świece dzienne.
- Nagłówki: `User-Agent` przeglądarkowy (Chrome 126) + `Accept: application/json`. Bez UA Yahoo potrafi odrzucać zapytania.
- Timeout: `AbortSignal.timeout(20000)`, fetch z `cache: "no-store"`.
- Jedno zapytanie zwraca wszystko naraz: historię OHLCV (`result.timestamp` + `result.indicators.quote[0]`), bieżącą cenę (`meta.regularMarketPrice`), walutę (`meta.currency`), czas ostatniego notowania (`meta.regularMarketTime`) i przesunięcie strefy giełdy (`meta.gmtoffset`).

### PUŁAPKA: `range=max` zwraca dane MIESIĘCZNE

Parametr `range=max` (alternatywa dla `period1`/`period2`) zwraca świece **miesięczne** mimo jawnego `interval=1d`. Objaw: wykres MAX ma ~1 punkt na miesiąc, a `quotes_daily` dostaje dziurawą historię. Odkryte i naprawione podczas budowy — dlatego `fetchChart()` **zawsze** używa `period1`/`period2` i nigdy `range`. Nie „upraszczaj" tego z powrotem na `range`.

### Konwencja symboli

- GPW: ticker + sufiks `.WA`, np. `PKN.WA`, `CDR.WA`.
- USA: goły ticker, np. `AAPL`, `MSFT`.
- `suggestQuoteSymbol(ticker, market)` w `yahoo.ts` generuje symbol automatycznie (dla `market === "GPW"` dokleja `.WA`, jeśli go nie ma). Symbol jest zapisany w kolumnie `companies.quote_symbol` i może być ręcznie nadpisany (np. dla ETF-ów notowanych pod innym symbolem).

### Strefy czasowe — `gmtoffset`

Timestampy Yahoo są w UTC, ale daty świec muszą być w **strefie giełdy** (sesja GPW i NYSE to różne doby UTC). Konwersja: `new Date((epoch + gmtoffset) * 1000).toISOString().slice(0, 10)` — dodajemy `meta.gmtoffset` i czytamy datę „jak UTC". Analogicznie godzina notowania (`HH:MM`). Bez tego świece amerykańskie po zamknięciu wpadałyby w zły dzień.

Dodatkowa pułapka: Yahoo potrafi zwrócić **dwa wpisy z tą samą datą** (świeca historyczna + bieżąca sesja). `fetchChart()` deduplikuje mapą po dacie, zostawiając ostatni wpis. Dni bez notowań mają `close: null` i są pomijane.

### Obsługa błędów

- `404` → nieznany symbol; komunikat po polsku podpowiada konwencję `TICKER.WA`.
- `429` → przekroczony limit zapytań; komunikat „spróbuj ponownie za chwilę". Brak automatycznego retry/backoffu — odświeżanie jest ręczne, więc użytkownik po prostu ponawia.
- Inne kody → `Yahoo Finance: HTTP {status}`.
- `200` bez `chart.result[0]` → rzucamy `chart.error.description` z odpowiedzi albo generyczny „Brak danych".
- W `refreshQuotes()` (`quotes.ts`) błąd jednej spółki nie przerywa pętli — trafia do `result.errors[]` per ticker.

### Strategia inkrementalna z 7-dniową zakładką

`refreshCompany()` w `quotes.ts`:

1. Bierze `max(quotes_daily.date)` dla spółki.
2. Jeśli brak — pobiera pełną historię (`period1=0`). Jeśli jest — pobiera od `ostatnia_świeca - 7 dni`.
3. Zakładka 7 dni celowo nadpisuje ostatnie świece: Yahoo koryguje dane wstecz (świeca bieżącej sesji jest niedomknięta, zdarzają się korekty), więc upsert `onConflictDoUpdate` po PK `(company_id, date)` odświeża zakres nakładki. Wstawki idą partiami po 400 wierszy (limit zmiennych SQLite).
4. Bieżąca cena trafia do `quotes_latest` (upsert po `company_id`); `prevClose` liczony lokalnie jako ostatni `close` z `quotes_daily` **sprzed** daty notowania — nie ufamy `meta.previousClose` Yahoo.

## Dlaczego NIE Stooq

Projekt **zaczynał** na Stooq (stooq.pl) — proste CSV, dane GPW, brak klucza. W 2026 to źródło jest martwe dla botów:

- Endpoint bieżących notowań `https://stooq.pl/q/l/?s=...&f=...` — zwraca **404** lub stronę z **JS-challenge anty-botowym** zamiast CSV.
- Endpoint historii `https://stooq.pl/q/d/l/?s=...&i=d` — to samo: 404 albo challenge wymagający wykonania JavaScriptu w przeglądarce.
- Zmiana User-Agenta, nagłówków i cookies nie pomagała — challenge jest po stronie serwera.

Cały kod notowań został przepisany na Yahoo Finance (patrz wyżej). Jeśli w przyszłości ktoś rozważa powrót do Stooq lub inne źródło CSV — najpierw sprawdź `curl`-em, czy odpowiedź to faktycznie CSV, a nie HTML z challenge.

## NBP — kursy walut

Klient: `src/lib/nbp.ts`. Oficjalne API NBP, bez klucza. Używany do przeliczeń USD→PLN (i innych walut) pod wycenę i PIT-38.

### Endpoint

```
GET https://api.nbp.pl/api/exchangerates/rates/a/{waluta}/{od}/{do}/?format=json
```

- Tabela **A** (kursy średnie), waluta małymi literami (np. `usd`), daty `YYYY-MM-DD`.
- Odpowiedź: `{ rates: [{ effectiveDate, mid }] }` — bierzemy `mid`.
- `404` w zakresie dat = brak notowań (np. zakres obejmuje same weekendy/święta) — traktowane jako pusta lista, nie błąd.
- Timeout 15 s, `cache: "no-store"`.

### Limit ~255 notowań i chunking

NBP odrzuca zapytania o zakres dłuższy niż ~255 notowań (dni roboczych). `ensureFxRates()` dzieli zakres na kawałki po **250 dni kalendarzowych** i pobiera sekwencyjnie. Pobieranie jest przyrostowe: funkcja czyta `min`/`max` daty z cache i dociąga tylko brakujące końce zakresu (przed `min` i po `max`), z buforem 10 dni przed `fromDate` na dni wolne.

### Cache

Tabela `fx_rates`, PK `(currency, date)`, wstawianie `onConflictDoNothing` partiami po 400. `PLN = 1` zwracane bez zapytania. `refreshQuotes()` woła `ensureFxRates()` dla każdej waluty portfela od `min(data pierwszej transakcji, data pierwszej dywidendy)`, minimum 730 dni wstecz (pod wykres wartości portfela).

### Zasada D-1 (podatkowa) vs wycena bieżąca

Dwie różne funkcje — nie wolno ich mylić:

- **`getFxRateBefore(currency, date)`** — kurs D-1: ostatni kurs opublikowany **ściśle PRZED** datą (`date < data`, `ORDER BY date DESC LIMIT 1`). Tak liczy się PIT-38: kurs z ostatniego dnia roboczego poprzedzającego transakcję/dywidendę. Używana w silniku FIFO (`portfolio.ts`) dla obu stron transakcji (kupno i sprzedaż) oraz dywidend.
- **`getFxRateOnOrBefore(currency, date)`** / **`getLatestFxRate(currency)`** — ostatni znany kurs **włącznie** z datą. Do bieżącej wyceny pozycji i historii wartości portfela. Nie do podatków.

## Kanały RSS — newsy

Moduł: `src/lib/news.ts` (parser `fast-xml-parser`, obsługa RSS 2.0 i Atom). Deduplikacja po `UNIQUE(news_items.url)` przez `onConflictDoNothing` — ten sam artykuł z tego samego feeda nigdy się nie zduplikuje (ale ten sam artykuł pod **różnymi URL-ami** w różnych feedach Bankiera już tak — znane ograniczenie).

### Zweryfikowane działające feedy (seed w `DEFAULT_SOURCES`)

| Nazwa | URL |
|---|---|
| Bankier — komunikaty ESPI | `https://www.bankier.pl/rss/espi.xml` |
| Bankier — Giełda | `https://www.bankier.pl/rss/gielda.xml` |
| Bankier — Wiadomości | `https://www.bankier.pl/rss/wiadomosci.xml` |
| Strefa Inwestorów | `https://strefainwestorow.pl/rss.xml` |

Seedowane przez `seedDefaultSourcesIfEmpty()` (wołane z `POST /api/news/refresh`), tylko gdy tabela `news_sources` jest pusta.

### Feedy, które NIE działają (nie dodawaj ponownie)

- `https://www.stockwatch.pl/rss` — **404**.
- `https://www.bankier.pl/rss/ebi.xml` — odpowiada, ale zwraca **pustą treść** (zero wpisów).

Nowe źródło dodawane w Ustawieniach jest walidowane przed zapisem: `fetchFeed()` robi fetch + parse; jeśli odpowiedź nie zawiera tagu `<rss` ani `<feed` i nie ma wpisów — rzuca „Odpowiedź nie wygląda na kanał RSS/Atom".

### PUŁAPKA: ucięty surowy CSS w opisach ESPI Bankiera

Bankier w polu `description` komunikatów ESPI zostawia **surowy CSS bez tagów `<style>`** — często ucięty w połowie reguły, więc zwykłe zdejmowanie tagów HTML go nie usuwa i śmieci trafiałyby do podsumowań. Czyszczenie w `stripHtml()`:

1. Standardowo: usunięcie bloków `<style>`/`<script>`, znaczników CDATA, tagów HTML, dekodowanie encji, zwinięcie białych znaków.
2. **Cięcie CSS**: znajdujemy pierwszą klamrę `{`; od niej wszystko jest śmieciem. Cofamy się dodatkowo po znakach selektora CSS (`[a-z0-9.#>\s,:*-]`), żeby uciąć też sam selektor sprzed klamry, i obcinamy resztę tekstu.
3. Boilerplate raportów ESPI: wycinamy blok `Spis treści:` … `PODPISY OSÓB REPREZENTUJĄCYCH SPÓŁKĘ` oraz końcówkę od `Spis załączników:`.

Podsumowanie po czyszczeniu jest ucinane do 500 znaków.

### Dopasowanie newsów do spółek

`buildMatchers()` buduje wzorce per spółka, `matchCompanies()` testuje `tytuł + podsumowanie`:

- **Ticker** — tylko jeśli ma **min. 3 znaki** (żeby `CD`, `PL` itp. nie łapały wszystkiego); dopasowanie jako osobne słowo: regex z ujemnymi asercjami `(?<![\p{L}\d])…(?![\p{L}\d])`, flagi `iu` (Unicode — polskie znaki liczą się jako litery).
- **Pełna nazwa spółki** — proste dopasowanie podłańcucha, case-insensitive (min. 3 znaki).
- **Aliasy** — kolumna `companies.aliases`, lista po przecinku (np. „Orlen, PKN Orlen"); każdy alias min. 3 znaki, dopasowanie jak nazwa.
- **Źródło przypisane do spółki** (`news_sources.company_id` ≠ NULL) — każdy wpis z takiego feeda jest automatycznie tagowany tą spółką, niezależnie od dopasowań tekstowych.

Dopasowania lądują w tabeli złączeniowej `news_company` (M:N, `onConflictDoNothing`). Matchowanie odbywa się **tylko przy wstawieniu** nowego wpisu — dodanie spółki później nie otaguje wstecznie starych newsów.

Błąd jednego feeda nie przerywa odświeżania pozostałych; komunikat trafia do `news_sources.last_error` i do wyniku `refreshNews()`.

## OpenRouter — AI

Klient: `src/lib/ai.ts`, endpoint API: `src/app/api/ai/chat/route.ts`, parser strumienia po stronie klienta: `src/lib/sse.ts`.

### Endpoint i autoryzacja

```
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer {openrouter_api_key}
HTTP-Referer: http://localhost:3000
X-Title: Invest Dashboard
```

API zgodne z OpenAI chat completions. Body: `{ model, messages, stream }`. Timeout 120 s (`AbortSignal.timeout`), a route ma `maxDuration = 300`. Nagłówki `HTTP-Referer` i `X-Title` to konwencja OpenRouter do identyfikacji aplikacji w ich statystykach.

### Konfiguracja w tabeli `settings`

Klucze zdefiniowane w `src/lib/settings.ts` (`SETTING_KEYS`):

- `openrouter_api_key` — klucz API; brak klucza = błąd „Brak klucza OpenRouter. Dodaj klucz API w Ustawieniach." (endpoint `GET /api/settings` maskuje wartość klucza).
- `openrouter_model` — id modelu; domyślnie `anthropic/claude-sonnet-4.5` (`DEFAULT_MODEL`).

### Streaming (SSE passthrough)

Przepływ:

1. `POST /api/ai/chat` przyjmuje `{ messages, companyId? }`, filtruje wiadomości do ról `user`/`assistant`.
2. Do promptu systemowego (`SYSTEM_PROMPT` — polski asystent researchu, markdown) doklejany jest kontekst z `buildCompanyContext(companyId)`: dane spółki, ostatnie notowanie z `quotes_latest` (z wyliczoną zmianą dzienną), pozycja z portfela (FIFO), 15 ostatnich newsów (podsumowania ucięte do 200 znaków), 5 ostatnich notatek (do 3000 znaków każda).
3. `openrouterChat(messages, { stream: true })` zwraca surowy `Response`; route przekazuje `upstream.body` **bez przetwarzania** (passthrough) z nagłówkami `Content-Type: text/event-stream; charset=utf-8` i `Cache-Control: no-cache, no-transform`.
4. Klient (`streamChat()` w `sse.ts`) czyta strumień linia po linii: ignoruje komentarze keep-alive (linie od `:`), parsuje linie `data: {json}`, kończy na `data: [DONE]`, wyciąga `choices[0].delta.content` i woła `onDelta(text)`. Niepełny JSON (ucięty chunk) jest pomijany (`SyntaxError` → continue), a `error.message` w payloadzie rzuca wyjątek.

Błędy upstream (zły klucz, brak środków) zwracane są jako JSON `{ error }` ze statusem 502 — klient rozróżnia je po `res.ok` przed rozpoczęciem czytania strumienia.

---

*Utworzono: 2026-07-07. Dokument opisuje stan projektu na tę datę — endpointy zewnętrzne (zwłaszcza nieoficjalne Yahoo Finance i feedy RSS) mogą z czasem zmienić zachowanie.*
