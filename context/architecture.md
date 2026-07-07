# Architektura invest-dashboard

Prywatny, jednostanowiskowy dashboard inwestycyjny (GPW + USA + ETF-y, bez krypto) działający wyłącznie lokalnie na `localhost:3000`, z ręcznie wpisywanymi transakcjami, notowaniami z Yahoo Finance, kursami NBP, newsami RSS i asystentem AI przez OpenRouter.

## Przegląd

Stack (wersje z `package.json`):

| Warstwa | Technologia | Wersja |
|---|---|---|
| Framework | Next.js (App Router, Turbopack) | 16.2.10 |
| UI | React / React DOM | 19.2.4 |
| Język | TypeScript | ^5 |
| Style | Tailwind CSS v4 (`@tailwindcss/postcss`) | ^4 |
| Baza danych | better-sqlite3 | ^12.11.1 |
| ORM | drizzle-orm (+ drizzle-kit ^0.31.10 w dev) | ^0.45.2 |
| Wykresy liniowe | lightweight-charts | ^5.2.0 |
| Wykres donut | recharts | ^3.9.2 |
| Markdown | react-markdown + remark-gfm | ^10.1.0 / ^4.0.1 |
| Parser RSS/Atom | fast-xml-parser | ^5.9.3 |

Kluczowe decyzje:

- **SQLite w pliku `data/invest.db`** (WAL, `foreign_keys = ON`), zero zewnętrznej infrastruktury. Schemat tworzony bootstrapem `CREATE TABLE IF NOT EXISTS` przy starcie — bez migracji.
- **Notowania: Yahoo Finance** (nieoficjalne API v8/chart). Projekt zaczynał na Stooq, ale endpointy CSV Stooq (`q/l`, `q/d/l`) w 2026 zwracają 404 lub JS-challenge anty-botowy — całość przepisano na Yahoo.
- **Kursy walut: API NBP** (tabela A, kursy średnie) z cache w tabeli `fx_rates`. Zasada podatkowa D-1 (kurs z dnia roboczego poprzedzającego transakcję).
- **AI: OpenRouter** (API zgodne z OpenAI chat completions), streaming SSE, domyślny model `anthropic/claude-sonnet-4.5`.
- Ciemny motyw, tokeny kolorów w `@theme` w `src/app/globals.css`, UI w całości po polsku.
- Brak automatycznego odświeżania — notowania i newsy pobierane ręcznymi przyciskami.

## Struktura katalogów

```
src/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout: fonty Geist, Sidebar + <main>
│   ├── globals.css           # Tailwind v4 @theme — tokeny palety (ciemny motyw)
│   ├── page.tsx              # Dashboard: kafelki, wykres wartości 12 mies., donut alokacji, newsy
│   ├── portfolio/page.tsx    # Pozycje FIFO, transakcje, dywidendy, zrealizowane sprzedaże, PIT-38
│   ├── watchlist/page.tsx    # Spółki obserwowane
│   ├── companies/[id]/page.tsx # Karta spółki: wykres 3M/1R/3L/MAX, transakcje, newsy, notatki, czat AI
│   ├── news/page.tsx         # Newsy z filtrem spółka/nieprzeczytane
│   ├── research/             # Notatki markdown (lista, /new, /[id] — edytor z AI)
│   ├── settings/page.tsx     # Klucz OpenRouter, model, źródła RSS
│   └── api/                  # Route handlers (mutacje + akcje) — patrz sekcja API
├── components/
│   ├── ui.tsx                # Wspólne klocki UI bez "use client": Card, StatTile, Delta, Badge,
│   │                         #   Button, Input, Select, Textarea, Label, EmptyState, PageHeader,
│   │                         #   Table/Th/Td
│   ├── Modal.tsx             # Kliencki modal (Escape, klik w tło, blokada scrolla)
│   ├── charts/
│   │   ├── AreaChart.tsx     # Opakowanie lightweight-charts v5 (wykres liniowy/area)
│   │   ├── PriceChart.tsx    # Kurs spółki + przełącznik zakresu 3M/1R/3L/MAX (filtr po stronie klienta)
│   │   └── AllocationDonut.tsx # Donut alokacji (recharts)
│   ├── RefreshButtons.tsx    # RefreshQuotesButton, RefreshNewsButton (POST + router.refresh)
│   ├── CompanyForm.tsx       # Modal dodawania/edycji spółki
│   ├── TransactionForm.tsx / TransactionEditButton.tsx / DividendForm.tsx
│   ├── DeleteButton.tsx      # Generyczny przycisk DELETE z potwierdzeniem
│   ├── WatchlistToggle.tsx   # PATCH companies/[id] watchlist 0/1
│   ├── NewsFilter.tsx / NewsActions.tsx # Filtry i oznaczanie przeczytanych
│   ├── AiChat.tsx            # Czat AI na karcie spółki (streaming, zapis odpowiedzi jako notatka)
│   ├── NoteEditor.tsx        # Edytor markdown + podgląd + "Generuj analizę AI" (streaming do treści)
│   ├── AiSettingsForm.tsx / SourcesManager.tsx # Formularze na stronie Ustawień
│   ├── Markdown.tsx          # react-markdown + remark-gfm
│   └── Sidebar.tsx           # Nawigacja: Dashboard, Portfel, Watchlista, Newsy, Research, Ustawienia
├── db/
│   ├── schema.ts             # Definicje tabel Drizzle + eksport typów ($inferSelect)
│   └── index.ts              # Bootstrap SQL, singleton połączenia, re-eksport schematu
└── lib/                      # Cała logika domenowa (server-side, poza sse.ts)
    ├── yahoo.ts              # Klient Yahoo Finance v8/chart (fetchChart, suggestQuoteSymbol)
    ├── quotes.ts             # Orkiestracja odświeżania notowań (refreshQuotes)
    ├── nbp.ts                # Klient NBP + cache fx_rates (ensureFxRates, getFxRateBefore, ...)
    ├── portfolio.ts          # Silnik portfela: FIFO, PLN/D-1, PIT-38, portfolioValueHistory
    ├── news.ts               # RSS/Atom: fetch, parse, stripHtml, dopasowanie do spółek, listNews
    ├── ai.ts                 # OpenRouter: openrouterChat, buildCompanyContext, SYSTEM_PROMPT
    ├── sse.ts                # Kliencki parser SSE (streamChat) — wspólny dla czatu i edytora
    ├── settings.ts           # get/setSetting, SETTING_KEYS, DEFAULT_MODEL
    └── format.ts             # Formatowanie pl-PL (fmtMoney, fmtPct, ...), todayISO, nowISO
```

Dane trafiają do `data/invest.db` (katalog tworzony automatycznie przez `fs.mkdirSync` w `src/db/index.ts`).

## Schemat bazy danych

### Bootstrap i singleton (`src/db/index.ts`)

- `createDb()` tworzy katalog `data/`, otwiera `data/invest.db` przez better-sqlite3, ustawia `journal_mode = WAL` i `foreign_keys = ON`, po czym wykonuje `BOOTSTRAP_SQL` — blok `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` dla wszystkich tabel. Brak systemu migracji; schemat Drizzle w `schema.ts` musi być ręcznie zsynchronizowany z bootstrapem.
- Instancja jest **singletonem przez `globalThis.__investDb`** — przeżywa hot-reload (HMR) w dev, bo `globalThis` nie jest resetowane między przebudowami modułów.
- Indeksy: `idx_transactions_company (company_id, date)`, `idx_dividends_company (company_id, date)`, `idx_news_published (published_at DESC)`.

### Tabele (`src/db/schema.ts`)

**companies** — spółki posiadane i obserwowane:

| Kolumna | Typ | Uwagi |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| ticker | TEXT NOT NULL | |
| name | TEXT NOT NULL | |
| market | TEXT NOT NULL DEFAULT 'GPW' | `GPW` \| `US` \| `OTHER` |
| currency | TEXT NOT NULL DEFAULT 'PLN' | |
| quote_symbol | TEXT NOT NULL | symbol Yahoo, np. `PKN.WA`, `AAPL` |
| watchlist | INTEGER NOT NULL DEFAULT 0 | 0/1 |
| aliases | TEXT NULL | słowa kluczowe po przecinku do dopasowywania newsów |
| created_at | TEXT NOT NULL | ISO |

**transactions** — `company_id → companies.id ON DELETE CASCADE`:

| Kolumna | Typ | Uwagi |
|---|---|---|
| id | INTEGER PK | |
| company_id | INTEGER NOT NULL FK | |
| type | TEXT NOT NULL | `BUY` \| `SELL` |
| date | TEXT NOT NULL | `YYYY-MM-DD` |
| quantity | REAL NOT NULL | |
| price | REAL NOT NULL | w walucie spółki |
| commission | REAL NOT NULL DEFAULT 0 | w walucie spółki |
| note | TEXT NULL | |

**dividends** — `company_id → companies.id ON DELETE CASCADE`: `id`, `company_id`, `date`, `amount` (brutto, waluta spółki), `tax_withheld` (DEFAULT 0), `note`.

**quotes_latest** — cache bieżącej ceny, PK = `company_id` (FK CASCADE): `price NOT NULL`, `prev_close NULL`, `date`, `time` (HH:MM w strefie giełdy), `updated_at NOT NULL`.

**quotes_daily** — historia dzienna, **PK złożony (company_id, date)**, FK CASCADE: `open/high/low NULL`, `close NOT NULL`, `volume NULL`.

**fx_rates** — kursy średnie NBP (tabela A), **PK złożony (currency, date)**: `rate REAL NOT NULL`. Jeden wiersz na walutę i datę publikacji NBP.

**news_sources** — kanały RSS/Atom: `id`, `name`, `url`, `company_id NULL` (**FK CASCADE**; `NULL` = źródło globalne dopasowywane po słowach kluczowych, ustawione = wszystkie wpisy taguje tą spółką), `enabled DEFAULT 1`, `last_fetched_at`, `last_error`.

**news_items** — wpisy: `id`, `source_id NULL` (**FK → news_sources ON DELETE SET NULL**), `title`, `url NOT NULL UNIQUE` (klucz deduplikacji), `summary`, `published_at`, `read DEFAULT 0`, `created_at`.

**news_company** — junction M:N news ↔ spółka, **PK złożony (news_id, company_id)**, oba FK CASCADE.

**notes** — notatki researchowe markdown: `id`, `company_id NULL` (**FK ON DELETE SET NULL** — po usunięciu spółki notatka zostaje jako ogólna), `title`, `content DEFAULT ''`, `created_at`, `updated_at`.

**settings** — key/value: `key TEXT PK`, `value TEXT NOT NULL`. Używane klucze: `openrouter_api_key`, `openrouter_model`.

### Relacje — podsumowanie kaskad

- Usunięcie spółki: CASCADE kasuje `transactions`, `dividends`, `quotes_latest`, `quotes_daily`, `news_sources` (przypisane do niej), `news_company`; `notes.company_id` → SET NULL.
- Usunięcie źródła newsów: `news_items.source_id` → SET NULL (wpisy zostają).
- Usunięcie newsa: CASCADE kasuje wpisy w `news_company`.

## Przepływy danych

### Diagram ASCII

```
                 ZEWNĘTRZNE API                          PRZEGLĄDARKA (localhost:3000)
  ┌──────────────┐ ┌─────────┐ ┌───────────┐ ┌────────────┐   ┌─────────────────────────────┐
  │ Yahoo Finance│ │ NBP API │ │ RSS/Atom  │ │ OpenRouter │   │ Server components (strony)  │
  │ v8/chart     │ │ tabela A│ │ (Bankier, │ │ chat compl.│   │  force-dynamic, czytają lib │
  └──────┬───────┘ └────┬────┘ │ Strefa...)│ └─────▲──────┘   └──────────────▲──────────────┘
         │              │      └─────┬─────┘       │                         │ HTML (RSC)
         ▼              ▼            ▼             │ SSE                     │
  ┌─────────────┐ ┌───────────┐ ┌──────────┐ ┌────┴─────────┐   ┌───────────┴───────────────┐
  │ lib/yahoo.ts│ │ lib/nbp.ts│ │lib/news.ts│ │  lib/ai.ts   │   │ Klienckie komponenty       │
  └──────┬──────┘ └────┬──────┘ └────┬─────┘ └────▲─────────┘   │ (formularze, modale, czat) │
         │             │             │            │             └───────────┬───────────────┘
         ▼             ▼             ▼            │                         │ fetch POST/PATCH/DELETE
  ┌──────────────────────────────────────┐  ┌────┴──────────┐              ▼
  │            lib/quotes.ts             │  │ /api/ai/chat  │◄── ┌────────────────────┐
  │ (orkiestracja odświeżania)           │  │ (passthrough) │    │  /api/* routes     │
  └──────────────────┬───────────────────┘  └───────────────┘    └─────────┬──────────┘
                     ▼                                                     ▼
  ┌────────────────────────────────────────────────────────────────────────────────────┐
  │                      SQLite data/invest.db (Drizzle, WAL)                           │
  │  companies · transactions · dividends · quotes_latest · quotes_daily · fx_rates    │
  │  news_sources · news_items · news_company · notes · settings                       │
  └──────────────────────────────────┬─────────────────────────────────────────────────┘
                                     │ odczyt synchroniczny (better-sqlite3 .get()/.all())
                                     ▼
  ┌────────────────────────────────────────────────────────────────────────────────────┐
  │   lib/portfolio.ts (FIFO, PIT-38, historia wartości) · lib/news.ts (listNews)      │
  │                └── wywoływane bezpośrednio z server components ──┘                  │
  └────────────────────────────────────────────────────────────────────────────────────┘
```

### Odświeżanie notowań (krok po kroku)

Wejście: przycisk `RefreshQuotesButton` → `POST /api/quotes/refresh` → `refreshQuotes(companyIds?)` w `src/lib/quotes.ts`:

1. Pobiera listę spółek (wszystkie lub filtrowane po `companyIds`).
2. **Kursy walut najpierw**: wyznacza `fxFrom` = min(data pierwszej transakcji, data pierwszej dywidendy, dziś − 730 dni) i dla każdej waluty ≠ PLN woła `ensureFxRates(currency, fxFrom)` (`src/lib/nbp.ts`):
   - `ensureFxRates` sprawdza min/max dat w `fx_rates` i dociąga tylko brakujące zakresy (przed min i po max), z buforem −10 dni na dni wolne;
   - zapytania do `https://api.nbp.pl/api/exchangerates/rates/a/{waluta}/{od}/{do}/` dzielone na kawałki po ~250 dni (NBP limituje ~255 notowań na zapytanie); HTTP 404 = brak notowań w zakresie (zwraca pustą listę);
   - upsert `onConflictDoNothing` porcjami po 400 wierszy.
3. **Per spółka** — `refreshCompany`:
   - odczytuje `max(date)` z `quotes_daily` dla spółki;
   - `fetchChart(quoteSymbol, fromDate)` (`src/lib/yahoo.ts`) — inkrementalnie od ostatniej świecy **minus 7 dni zakładki** (`addDays(last, -7)`), a przy pierwszym pobraniu pełna historia (`period1=0`);
   - URL: `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1=..&period2=..&interval=1d`. **Krytyczne**: `range=max` zwraca dane MIESIĘCZNE mimo `interval=1d` — dlatego zawsze `period1/period2`. Daty świec przeliczane na strefę giełdy przez `meta.gmtoffset`; duplikaty dat (sesja bieżąca) — zostaje ostatni wpis;
   - świece upsertowane do `quotes_daily` (`onConflictDoUpdate` po PK, porcje po 400);
   - `prevClose` wyliczany lokalnie z `quotes_daily` (ostatni `close` PRZED datą notowania — `prevCloseFor`), a `regularMarketPrice` + data/godzina notowania upsertowane do `quotes_latest`.
4. Błędy per spółka/waluta zbierane do `{ updated, errors[] }` — jeden zepsuty ticker nie blokuje reszty. Wynik JSON wraca do przycisku, który pokazuje komunikat i woła `router.refresh()`.

### Pobieranie newsów i dopasowanie do spółek

`RefreshNewsButton` → `POST /api/news/refresh` → `seedDefaultSourcesIfEmpty()` + `refreshNews()` w `src/lib/news.ts`:

1. Seed domyślnych źródeł (tylko gdy tabela `news_sources` pusta): `bankier.pl/rss/espi.xml`, `bankier.pl/rss/gielda.xml`, `bankier.pl/rss/wiadomosci.xml`, `strefainwestorow.pl/rss.xml` (zweryfikowane; `stockwatch.pl/rss` = 404, `bankier.pl/rss/ebi.xml` zwraca pustą treść).
2. Dla każdego włączonego źródła (`enabled = 1`): `fetchFeed(url)` — fetch z desktopowym User-Agentem, timeout 20 s, potem `parseFeed` (fast-xml-parser) obsługujący **RSS 2.0** (`rss.channel.item`) i **Atom** (`feed.entry`, preferowany link `rel="alternate"`).
3. `stripHtml` czyści tytuły/opisy: usuwa tagi i encje, a dodatkowo obsługuje specyfikę Bankiera — w opisach ESPI zostaje UCIĘTY surowy CSS bez tagów `<style>`, więc funkcja tnie tekst od pierwszej klamry `{` (cofając się po znakach selektora `[a-z0-9.#>\s,:*-]`) i usuwa boilerplate `Spis treści:…PODPISY OSÓB REPREZENTUJĄCYCH SPÓŁKĘ` oraz `Spis załączników:…`. Summary obcinane do 500 znaków.
4. Insert do `news_items` z `onConflictDoNothing({ target: url })` — **deduplikacja po UNIQUE url**; duplikat = pomijamy dopasowanie.
5. Dopasowanie nowego wpisu do spółek (tekst = tytuł + summary):
   - jeśli źródło ma `company_id` → wpis zawsze przypisany do tej spółki;
   - matchery z `buildMatchers`: **ticker jako osobne słowo** (min. 3 znaki, regex `(?<![\p{L}\d])TICKER(?![\p{L}\d])` z flagami `iu`), pełna **nazwa** (min. 3 znaki, substring), **aliasy** rozdzielane przecinkami (min. 3 znaki każdy);
   - trafienia insertowane do `news_company` (`onConflictDoNothing`).
6. Źródło dostaje `last_fetched_at` + `last_error` (null przy sukcesie, komunikat przy błędzie). Wynik: `{ fetched, inserted, errors[] }`.

Znane ograniczenie: te same artykuły w różnych feedach Bankiera mają różne URL-e i nie są scalane.

### Czat AI ze streamingiem SSE

1. Klient (`AiChat.tsx` lub `NoteEditor.tsx` — „Generuj analizę AI") woła `streamChat({ messages, companyId }, onDelta)` z `src/lib/sse.ts` → `POST /api/ai/chat`.
2. Route (`src/app/api/ai/chat/route.ts`, `maxDuration = 300`): filtruje wiadomości do ról `user`/`assistant`, buduje system prompt = `SYSTEM_PROMPT` + (opcjonalnie) `buildCompanyContext(companyId)`.
3. `buildCompanyContext` (`src/lib/ai.ts`) składa markdown: dane spółki, bieżące notowanie ze zmianą %, pozycja z `computePortfolio()` (akcje, średni koszt, wynik niezrealizowany %), **15 ostatnich newsów** (summary do 200 znaków) i **5 ostatnich notatek** (do 3000 znaków każda).
4. `openrouterChat(messages, { stream: true })` → `POST https://openrouter.ai/api/v1/chat/completions` z Bearer z tabeli `settings`, nagłówkami `HTTP-Referer: http://localhost:3000` i `X-Title: Invest Dashboard`, timeout 120 s. Brak klucza = błąd „Brak klucza OpenRouter…" (HTTP 502 do klienta).
5. Route zwraca **surowe `upstream.body` jako passthrough** z `Content-Type: text/event-stream` — serwer nie parsuje strumienia.
6. Parsowanie po stronie klienta w `streamChat`: czytnik `res.body.getReader()`, bufor dzielony po `\n`, linie `data:` parsowane jako JSON (`choices[0].delta.content` → `onDelta`), `[DONE]` kończy, komentarze keep-alive (`:`) i niepełny JSON pomijane, `error.message` w payloadzie rzuca wyjątek.
7. UI: `AiChat` dokleja delty do ostatniej wiadomości asystenta (z autoscrollem) i pozwala zapisać odpowiedź jako notatkę (`POST /api/notes`); `NoteEditor` streamuje analizę wprost do pola treści.

### Mutacja → router.refresh()

Standardowy cykl każdej zmiany danych:

1. Kliencki komponent (formularz w modalu / przycisk) robi `fetch` na `/api/...` (POST/PATCH/DELETE).
2. Route handler waliduje body, wykonuje synchroniczną operację Drizzle (`.run()`/`.get()`), zwraca JSON.
3. Klient po sukcesie woła `router.refresh()` (hook `useRouter` z `next/navigation`) — Next ponownie renderuje server components strony, które czytają świeże dane bezpośrednio z SQLite.

Nie ma client-side cache stanu domenowego — źródłem prawdy jest zawsze baza, a `force-dynamic` gwarantuje brak cache'owania RSC.

## API routes

Wszystkie w `src/app/api/`. Odczyty stron NIE idą przez API (patrz Wzorce) — API służy mutacjom i akcjom.

| Endpoint | Metody | Zachowanie |
|---|---|---|
| `/api/companies` | GET | Lista wszystkich spółek. |
| | POST | Tworzy spółkę (ticker+name wymagane; waluta domyślnie USD dla US, PLN dla GPW; `quoteSymbol` sugerowany przez `suggestQuoteSymbol` — GPW dostaje sufiks `.WA`). **Od razu woła `refreshQuotes([id])`** — błąd pobrania nie blokuje utworzenia, wraca jako `refreshError`. |
| `/api/companies/[id]` | PATCH | Częściowa aktualizacja (ticker, name, market, currency, quoteSymbol, watchlist, aliases). 400 gdy brak zmian, 404 gdy brak spółki. |
| | DELETE | Usuwa spółkę (kaskady FK — patrz schemat). |
| `/api/transactions` | POST | Tworzy transakcję BUY/SELL (walidacja: data `RRRR-MM-DD`, quantity > 0, price ≥ 0). Przed zapisem **dociąga kursy NBP** `ensureFxRates(currency, date)` (błąd ignorowany — uzupełni się przy odświeżeniu notowań). |
| `/api/transactions/[id]` | PATCH | Częściowa aktualizacja pól transakcji. 404 gdy brak. |
| | DELETE | Usuwa transakcję. |
| `/api/dividends` | POST | Tworzy dywidendę (amount > 0 brutto + taxWithheld); też dociąga kursy NBP. |
| `/api/dividends/[id]` | DELETE | Usuwa dywidendę. |
| `/api/quotes/refresh` | POST | `refreshQuotes(companyIds?)` — body `{ companyIds: [] }` opcjonalne (puste/brak = wszystkie spółki). Zwraca `{ updated, errors[] }`. |
| `/api/news` | PATCH | `{ allRead: true }` oznacza wszystkie jako przeczytane; `{ id, read? }` pojedynczy news (read=false cofa). |
| | DELETE | Czyści WSZYSTKIE newsy (`news_company` + `news_items`), np. po zmianie źródeł. |
| `/api/news/refresh` | POST | Seeduje domyślne źródła (gdy tabela pusta) i uruchamia `refreshNews()`. Zwraca `{ fetched, inserted, errors[] }`. |
| `/api/news-sources` | GET | Lista źródeł (z seedem domyślnych, gdy pusto). |
| | POST | Dodaje źródło — **najpierw walidacja przez realny `fetchFeed(url)`** (fetch + parse); błąd = 400 z komunikatem. Zwraca `{ source, itemCount }`. |
| `/api/news-sources/[id]` | PATCH | Aktualizacja name/url/enabled/companyId. |
| | DELETE | Usuwa źródło (wpisy `news_items` zostają, `source_id` → NULL). |
| `/api/notes` | POST | Tworzy notatkę (title wymagany, companyId opcjonalne). |
| `/api/notes/[id]` | GET / PATCH / DELETE | Odczyt / częściowa aktualizacja (PATCH zawsze odświeża `updated_at`) / usunięcie. |
| `/api/settings` | GET | Zwraca model i **zamaskowany podgląd klucza** (`pierwsze 8…ostatnie 4` + `hasApiKey`) — klucz nigdy nie wraca w całości. |
| | POST | Zapisuje `apiKey` i/lub `model` do tabeli `settings`. |
| `/api/ai/chat` | POST | SSE passthrough do OpenRouter (opis w Przepływach); `maxDuration = 300`; 400 bez wiadomości, 502 przy błędzie upstreamu. |

## Wzorce

- **Server components czytają lib bezpośrednio + `force-dynamic`.** Każda strona (`src/app/**/page.tsx`) eksportuje `export const dynamic = "force-dynamic"` i woła synchronicznie funkcje z `src/lib/` oraz zapytania Drizzle (better-sqlite3 jest synchroniczny — `.get()`/`.all()` bez `await`). Przykład: `page.tsx` dashboardu woła `computePortfolio()`, `portfolioValueHistory(365)` i `listNews({ limit: 8 })` wprost. Brak warstwy fetchowania GET po stronie odczytu stron.
- **Mutacje wyłącznie przez API + `router.refresh()`.** Klienckie komponenty nie trzymają lokalnej kopii danych domenowych; po każdej mutacji odświeżają RSC.
- **Klienckie modale.** Formularze (CompanyForm, TransactionForm, DividendForm, ...) to komponenty `"use client"` otwierające `Modal.tsx` (obsługa Escape, klik w tło, `body.overflow = hidden`, `role="dialog"`). Przyciski otwierające modal są eksportowane jako `...ModalButton` i wstawiane do server components.
- **Wspólne komponenty `src/components/ui.tsx`** — celowo BEZ `"use client"`, więc renderują się po obu stronach: `Card`, `StatTile`, `Delta` (kwota/procent ze znakiem i kolorem pos/neg), `Badge`, `Button`, `Input`, `Select`, `Textarea`, `Label`, `EmptyState`, `PageHeader`, `Table`/`Th`/`Td`. Style przez tokeny Tailwind z `globals.css` (`ink`, `muted`, `surface`, `border`, `accent`, `pos`, `neg`, `warn`).
- **Odporne odświeżanie zbiorcze**: `refreshQuotes` i `refreshNews` zbierają błędy per element do tablicy `errors[]` zamiast przerywać całość; UI pokazuje zbiorczy komunikat.
- **Upserty porcjowane** (po 400 wierszy) z `onConflictDoUpdate`/`onConflictDoNothing` — limit liczby parametrów SQLite.
- **Ostrzeżenia zamiast wyjątków w silniku portfela**: brak kursu NBP lub nadsprzedaż akcji trafia do `summary.warnings[]` renderowanych jako baner, a wartości PLN, których nie da się policzyć, są `null` (UI pokazuje „—").

## Silnik portfela (`src/lib/portfolio.ts`)

### FIFO — `computePortfolio()`

- Transakcje spółki sortowane po `(date, id)`. Każdy BUY tworzy lot: `{ qty, costPerShare, fxBuy }`, gdzie **`costPerShare = price + commission/quantity`** (prowizja zakupu wliczona w koszt nabycia — zgodnie z przyjętą interpretacją PIT-38), a `fxBuy` = kurs **D-1** z `getFxRateBefore(currency, date)` (ostatni kurs NBP opublikowany PRZED datą transakcji; PLN = 1).
- SELL zdejmuje z przodu kolejki lotów (`lots[0]`, tolerancja `1e-9`): koszt = suma `take * costPerShare` zdejmowanych kawałków; koszt PLN = suma `take * costPerShare * fxBuy` (null, gdy któregokolwiek kursu brakuje). **Przychód = soldQty * price − commission** (prowizja sprzedaży pomniejsza przychód), PLN po kursie D-1 **dnia sprzedaży**. Wynik trafia do `realizedSales[]`. Sprzedaż ponad stan generuje ostrzeżenie, liczy się tylko pokryta ilość.
- Pozostałe loty = pozycja otwarta: `shares`, `costBasis`, `costBasisPln` (po kursach D-1 poszczególnych zakupów), `avgCost = costBasis/shares`. Wycena: `price` z `quotes_latest` × `getLatestFxRate(currency)` (ostatni znany kurs — bieżąca wycena NIE stosuje D-1). Zmiana dzienna z `prevClose`. Pozycje o `shares ≤ 1e-9` (zamknięte) nie są pokazywane.
- Dywidendy przeliczane po kursie D-1 daty wypłaty (brutto + podatek pobrany).
- Weryfikacja liczbowa (potwierdzona podczas budowy): kupno 100 szt. po 60 z prowizją 19, sprzedaż 30 szt. po 70 z prowizją 10 → zysk 284,30 zł, podatek 54,02 zł.

### PIT-38 — `computeYearlyTax(summary)`

Agregacja per rok (z `date.slice(0,4)`):

- akcje: `proceedsPln`, `costsPln`, `incomePln = proceeds − costs`, `tax19 = round(19% * income)` przy dochodzie > 0 (0 przy stracie; strata nie przenosi się między latami w tym wyliczeniu);
- dywidendy: `divGrossPln`, `divWithheldPln`, **dopłata `divTaxDuePln = max(0, 19% * brutto − pobrany)`** (zaokrąglenie do grosza).

### `portfolioValueHistory(days = 365)` — sweep

Historia wartości portfela w PLN do wykresu na dashboardzie:

1. Pobiera świece `quotes_daily` od `dziś − days` i buduje **unię dat notowań wszystkich spółek** (posortowaną) — oś czasu sweepa.
2. Transakcje dzieli na: stan początkowy `sharesBefore` (delty sprzed okna) i posortowane listy delt `txDeltas` per spółka w oknie. **Delty aplikowane są dla wszystkich transakcji z datą ≤ data bieżącej świecy** — naprawiony bug: transakcja zawarta w dzień bez notowań (weekend/święto) była wcześniej gubiona przy dopasowaniu po dokładnej dacie.
3. Dla każdej daty osi, dla każdej spółki: przesuwa wskaźnik transakcji (dokłada delty), przesuwa wskaźnik świec (pamięta `lastClose` — ostatni znany close, więc spółka bez notowania danego dnia wyceniana jest po poprzednim), i jeśli `shares > 0` dodaje `shares * lastClose * fx` do sumy dnia.
4. Kursy walut: cache posortowanych list `fx_rates` per waluta + **wyszukiwanie binarne** ostatniego kursu ≤ data (`fxOnOrBefore`); brak kursu = składnik liczony jako 0.
5. Zwraca `{ date, value }[]` z wartością zaokrągloną do grosza; złożoność liniowa względem (świece + transakcje) dzięki wskaźnikom, bez zapytań w pętli.

---

*Dokument utworzony 2026-07-07. Opisuje stan projektu na tę datę — przy rozbieżnościach kod źródłowy jest ostatecznym źródłem prawdy.*
