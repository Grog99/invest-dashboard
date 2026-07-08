# Ikonki (logo) spółek

> Plan wygenerowany przez skill `/plan-feature`. Slug: `ikonki-spolek`. Branch: `feature/ikonki-spolek`.

## Kontekst / Problem

W dashboardzie w wielu miejscach są listy/tabele spółek (portfel — Pozycje/Transakcje/Zrealizowane/Dywidendy, watchlista, nagłówek szczegółów spółki, dashboard). Dziś każda pozycja to sam tekstowy ticker (np. `PKN`, `AAPL`) — przy dłuższej liście trudno szybko wzrokowo znaleźć i rozróżnić konkretną spółkę. Ikonki (logo) obok tickera dają natychmiastowy „anchor” wizualny i ujednolicają wygląd całej aplikacji.

Oczekiwany efekt: przy każdym tickerze widoczne małe logo spółki (zaciągane z zewnętrznego źródła i cache'owane lokalnie), a gdy logo nie istnieje — deterministyczny awatar z inicjałami + kolorem (nigdy puste miejsce), spójnie na desktopie (tabele) i na mobile (karty <768px).

## Wymagania

- Małe logo obok tickera wszędzie, gdzie renderowana jest lista/tabela spółek: `portfolio`, `watchlist`, nagłówek `companies/[id]`, dashboard (tam gdzie ticker jest elementem listy), oraz w widokach kartowych mobilnych tych samych miejsc.
- Źródło logo: łańcuch fallbacków **Brandfetch → Wikidata → Google favicon → awatar z inicjałami**, kluczowany po **domenie** spółki (nie po tickerze).
- Fallback końcowy: awatar z inicjałami tickera + deterministyczny kolor (hash tickera → paleta). Działa offline, zawsze.
- Logo cache'owane lokalnie (nie bić w zewnętrzne API przy każdym renderze). Odświeżanie z TTL + akcja ręczna.
- Zero regresji desktopu; pełna responsywność mobilna (weryfikacja na ~360–390px) — patrz `AGENTS.md`.
- Bez layout-shiftu: logo ma stały rozmiar (kwadrat), rezerwuje miejsce.
- `npm run lint` i `npm run build` przechodzą.

## Zakres i Non-goals

**W zakresie:**
- Komponent `CompanyLogo` (logo + fallback inicjały/kolor).
- Warstwa danych: kolumna `domain` na `companies` (+ migracja + edycja w formularzu), tabela cache `company_logos`, cache bajtów na dysku (`DATA_DIR/logos/{companyId}`).
- Resolver logo (`src/lib/logos.ts`) z łańcuchem Brandfetch→Wikidata→Google favicon oraz orkiestracja `refreshLogos()`.
- Route handler serwujący bajty logo z dysku.
- Wstawienie `CompanyLogo` we wszystkich wymienionych miejscach (tabele desktop + karty mobile).
- Statyczna mapa `TICKER_DOMAINS` (seed domen dla znanych GPW/US), używana gdy brak `domain` w rekordzie.
- Pobranie logo przy tworzeniu/edycji spółki (best-effort, nieblokujące) + odświeżanie logo dołączone do istniejącej akcji „Odśwież ceny”.

**Non-goals (świadomie pomijamy):**
- Ręczny upload / nadpisanie logo per spółka (do rozważenia później — patrz „Decyzje”).
- Pełne Brand API Brandfetch (metadane, kolory marki) — używamy tylko darmowego Logo Link (CDN).
- Optymalizacja obrazów przez `next/image` / image optimizer — logo są maleńkie, serwujemy jako-jest przez `<img>` (uzasadnienie w „Podejście”).
- Logo dla indeksów (INDEX) — brak sensownego logo; zawsze awatar z inicjałami.

## Podejście

> **Reguła z `AGENTS.md` — WERYFIKACJA API NEXT.JS.** To nie jest „znany” Next.js. W środowisku planowania `node_modules` **nie było zainstalowane**, więc nie dało się odczytać `node_modules/next/dist/docs/`. Rekomendacje poniżej opierają się na **udowodnionych wzorcach w tym repo** (route handler serwujący bajty z dysku: `src/app/api/attachments/[id]/route.ts`; strony `export const dynamic = "force-dynamic"`) oraz na ustaleniach z już zrealizowanego planu PWA (`docs/plans/pwa-wersja-mobilna.md`, Next **16.2.10**). **Przed implementacją wykonawca MUSI przeczytać w `node_modules/next/dist/docs/`**: route handlers (konwencja `route.ts`, domyślne cache'owanie GET, `dynamic`/`revalidate`), obsługę obrazów (`images.remotePatterns` jeśli ktoś sięgnie po `next/image`) i cache. Nie zakładać zachowań z pamięci treningowej.

### 1. Skąd domena (klucz łańcucha logo)

W schemacie nie ma `domain`/ISIN. Podejście **hybrydowe**:
- **Nowa, nullowalna kolumna `domain` na `companies`** — dodana idempotentną migracją **dokładnie wg wzorca `migrateCompanyType()` w `src/db/index.ts`** (read-only guard `PRAGMA table_info` → `ALTER TABLE ... ADD COLUMN domain TEXT` w transakcji z ponownym sprawdzeniem kolumny; kolumna nullowalna, więc bez backfillu). Dodać `domain TEXT` też do `BOOTSTRAP_SQL` (świeże bazy) i do `companies` w `src/db/schema.ts`.
- Kolumna edytowalna w `CompanyForm` (`src/components/CompanyForm.tsx`) i obsługiwana w POST/PATCH (`src/app/api/companies/route.ts`, `.../[id]/route.ts`).
- **Statyczna mapa `TICKER_DOMAINS`** (`src/lib/logos.ts`) — seed domen znanych spółek (GPW: PKN→orlen.pl, CDR→cdprojekt.com, PZU→pzu.pl…; US: AAPL→apple.com…), używana jako **default gdy `company.domain` jest puste**. Efektywna domena = `company.domain ?? TICKER_DOMAINS[ticker] ?? null`.
- Gdy domena `null` → pomijamy Brandfetch i Google favicon (oba wymagają domeny), próbujemy Wikidata po `company.name`, a jak nic — awatar.

### 2. Łańcuch źródeł logo (server-side, raz, do cache'u)

Resolver `resolveLogo(company)` w `src/lib/logos.ts` próbuje po kolei, bierze pierwszy zwracający poprawny obraz:
1. **Brandfetch (PRIMARY)** — `https://cdn.brandfetch.io/{domain}?c={BRANDFETCH_CLIENT_ID}`. **UWAGA (zweryfikowane 2026): Logo Link WYMAGA darmowego `client id`** w query `?c=...` (rejestracja w Brandfetch Developer Portal). Bez atrybucji, „fair use”. Klucz w **env var `BRANDFETCH_CLIENT_ID`**; gdy nieustawiony → krok pomijany (łańcuch zaczyna od Wikidata). Wymaga domeny.
2. **Wikidata / Wikipedia (SECONDARY)** — najlepsze pokrycie polskich blue-chipów. Wyszukanie encji po `company.name` (wbsearchentities), pobranie property **P154** (logo image) z Commons, albo Wikipedia REST `page/summary` thumbnail. Działa bez domeny.
3. **Google favicon (TERTIARY)** — `https://www.google.com/s2/favicons?domain={domain}&sz=64`. Nieoficjalne, wymaga domeny, zawsze coś zwróci dla żywej domeny (choć czasem generyczny glob).
4. **Awatar z inicjałami (fallback)** — NIE pobierany/serwowany; renderowany w komponencie po stronie klienta (patrz pkt 5).

Każdy krok: `fetch` z `User-Agent` (jak w `src/lib/yahoo.ts` / `src/lib/news.ts`), `AbortSignal.timeout(...)`, walidacja że odpowiedź to obraz (Content-Type `image/*` + sniff magic bytes — **reużyj `sniffImageMime()` z `src/lib/attachments.ts`**) i rozsądny rozmiar. Normalizacja przez `sharp` (już w deps, wzorzec w `processImage()` z `attachments.ts`) do stałego **128×128 PNG** (decyzja: spójny wygląd, mniejszy dysk).

### 3. Cache — dysk + tabela statusu (wzorzec `attachments` + `quotesLatest`)

- **Bajty na dysku:** `DATA_DIR/logos/{companyId}` — **kalka `src/lib/attachments.ts`** (`ATTACHMENTS_DIR`, `attachmentPath(id)`, `ensureAttachmentsDir()`). Nowy plik `src/lib/logos.ts` eksportuje `LOGOS_DIR`, `logoPath(companyId)`, `ensureLogosDir()`. Klucz = `companyId` (integer, bez path traversal — jak w attachments). Trzymanie w `DATA_DIR` (nie w `public/`) jest **świadome**: `next.config.ts` ma `output: "standalone"`, a standalone nie kopiuje `public/` automatycznie (ryzyko odnotowane w planie PWA) — serwowanie przez route handler z `DATA_DIR` jest niezawodne i spójne z załącznikami.
- **Tabela statusu `company_logos`** (nowa, w `schema.ts` + `BOOTSTRAP_SQL`), wzorowana na `quotes_latest`:
  - `companyId` INTEGER PK REFERENCES companies(id) ON DELETE CASCADE
  - `source` TEXT — `BRANDFETCH` | `WIKIDATA` | `GOOGLE` | `NONE`
  - `mime` TEXT, `size` INTEGER
  - `fetchedAt` TEXT, `checkedAt` TEXT (do TTL)
  - `NONE` = zapamiętany negatywny wynik (żeby nie bić w API co render); rekord istnieje zawsze po pierwszej próbie.
- **TTL:** logo zmienia się rzadko — retry dla `NONE`/odświeżenie dla trafień np. co 30 dni (stała w `logos.ts`). Świeżo pobrane logo nie jest ponawiane do TTL.
- **Serwowanie:** route handler `GET /api/companies/[id]/logo` — **kalka `src/app/api/attachments/[id]/route.ts`**: czyta `logoPath(companyId)`, zwraca `new Response(new Uint8Array(buf), { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=86400" } })`. Brak pliku → 404. (Nie `immutable` jak w attachments — logo bywa odświeżane; `max-age` z dobowym oknem wystarcza, a odświeżenie i tak zmienia bajty pod tym samym URL.)

### 4. Kiedy pobieramy logo

- **Przy tworzeniu/edycji spółki** — w `POST /api/companies` i `PATCH /api/companies/[id]` dołożyć best-effort, **nieblokujące** wywołanie `refreshLogos([id])` w `try/catch` (dokładnie wzorzec obecnego `refreshQuotes([created.id])` w tych routach — błąd nie blokuje zapisu). Odpalać zwłaszcza po zmianie `domain`/`name`.
- **Akcja ręczna** — bez osobnego przycisku/route'a (decyzja z rundy doprecyzowania). `src/app/api/quotes/refresh/route.ts` po `refreshQuotes(companyIds)` dokłada best-effort `refreshLogos(companyIds)` w `try/catch` — istniejący przycisk „Odśwież ceny” (`src/components/RefreshButtons.tsx`) odświeża teraz też logo, bez zmian w UI przycisku.
- **Orkiestracja `refreshLogos(companyIds?)`** w `logos.ts` — kalka `refreshQuotes()` z `src/lib/quotes.ts` (iteracja po spółkach, zbieranie błędów w `RefreshResult`, respektowanie TTL/`checkedAt`). Świadomie **oddzielona funkcja** od `refreshQuotes` (osobna logika/TTL), ale wołana z tego samego route'a odświeżania. **Bez schedulera** (decyzja) — tylko on-demand.

### 5. Komponent `CompanyLogo`

`src/components/CompanyLogo.tsx`, `"use client"` (potrzebny `onError` do podmiany na awatar, gdy plik zniknął/404).
- Propsy: `ticker`, `name`, `companyId`, `hasLogo: boolean`, `size?: "sm" | "md"` (sm ≈ 20px w listach, md ≈ 32px w nagłówku).
- Gdy `hasLogo`: `<img src={`/api/companies/${companyId}/logo`} width height loading="lazy" ... />` w kontenerze o stałym rozmiarze; `onError` → przełącz na awatar.
- Awatar: 1–2 znaki tickera + tło z **deterministycznej palety** (hash tickera modulo długość palety). Paleta zdefiniowana lokalnie (kilka par tło/tekst zgodnych z motywem — bazować na tokenach z `globals.css`, czytelne w dark i light). Kwadrat `rounded-md`, `shrink-0`, `tabular`/uppercase inicjały.
- Bez layout-shiftu: kontener zawsze ma finalny rozmiar (i dla img, i dla awatara).

**Skąd `hasLogo` w stronach:** helper serwerowy `getLogoFlags(companyIds): Map<number, boolean>` w `logos.ts` (jedno zapytanie do `company_logos` po `source != 'NONE'`), wołany raz na stronę — **wzorzec mapy `quotes` z `watchlist/page.tsx`** (`new Map(db.select()... )`). Strony przekazują `hasLogo` do `CompanyLogo`, dzięki czemu spółki bez logo renderują awatar od razu, bez zbędnego 404.

### 6. Wstawienie w UI (desktop tabela + karta mobile)

Wszędzie ten sam wzorzec: `CompanyLogo size="sm"` tuż przed tickerem, wyrównane `inline-flex items-center gap-2`. W kartach mobilnych logo w lewej części nagłówka karty.

## Pliki do zmiany

**Warstwa danych / DB**
- `src/db/schema.ts` — dodać `domain: text("domain")` (nullable) do `companies`; dodać nową tabelę `companyLogos` (pola jak w pkt 3) + `export type CompanyLogo`.
- `src/db/index.ts` — w `BOOTSTRAP_SQL`: `domain TEXT` w `companies` + `CREATE TABLE IF NOT EXISTS company_logos (...)`. Dodać `migrateCompanyDomain(sqlite)` (kalka `migrateCompanyType`, str. ~240–271) i wywołać w `createDb()` po `migrateCompanyType`.

**Backend logo**
- `src/lib/logos.ts` — **nowy**. `LOGOS_DIR`, `logoPath()`, `ensureLogosDir()` (kalka `src/lib/attachments.ts`); `TICKER_DOMAINS`; `resolveLogo(company)` (łańcuch Brandfetch/Wikidata/Google); `refreshLogos(companyIds?)` (kalka `refreshQuotes` z `src/lib/quotes.ts`); `getLogoFlags(ids)`. Reużyj: `sniffImageMime`/`processImage` z `src/lib/attachments.ts`, `nowISO`/`todayISO` z `src/lib/format.ts`, wzorzec `fetch`+UA+timeout z `src/lib/yahoo.ts`.
- `src/app/api/companies/[id]/logo/route.ts` — **nowy**. `GET` serwujący bajty z `logoPath()` (kalka `src/app/api/attachments/[id]/route.ts`).
- `src/app/api/quotes/refresh/route.ts` — **rozszerzenie, nie nowy plik** (decyzja z rundy doprecyzowania: bez osobnego przycisku/route'a na logo). Po `refreshQuotes(companyIds)` dołożyć best-effort `refreshLogos(companyIds)` w `try/catch` — błąd pobrania logo nie blokuje odpowiedzi ani nie psuje wyniku odświeżenia cen.
- `src/app/api/companies/route.ts` (POST) i `src/app/api/companies/[id]/route.ts` (PATCH) — obsłużyć pole `domain`; po zapisie best-effort `refreshLogos([id])` w `try/catch` (wzorzec obecnego `refreshQuotes`).

**Komponenty / UI**
- `src/components/CompanyLogo.tsx` — **nowy** (`"use client"`), logo + awatar-fallback (pkt 5).
- `src/components/CompanyForm.tsx` — dodać pole `domain` (Input, opcjonalne; placeholder np. „orlen.pl”); wysłać w payloadzie POST/PATCH.
- `src/components/ui.tsx` — `PageHeader` dziś ma `title: string`. Dodać opcjonalny slot `icon?: ReactNode` (renderowany przed `<h1>`), by wstawić logo w nagłówku spółki bez zmiany typu `title`. Reużyj istniejący `Field` do kart (już jest).
- `src/app/portfolio/page.tsx` — **wszystkie tabele/karty z tickerem** (decyzja: zasięg pełny): „Pozycje” (desktop komórka Spółka ~l.110–120 + karty mobile ~l.153–164), oraz Transakcje/Zrealizowane/Dywidendy (desktop + karty mobile) — wszędzie `CompanyLogo size="sm"` przed tickerem, `companyById` już dostępne do zmapowania tickera na `companyId`/`domain`.
- `src/app/watchlist/page.tsx` — desktop (~l.107–117) i karta mobile (~l.174–184): `CompanyLogo` po `WatchlistToggle`, przed tickerem.
- `src/app/companies/[id]/page.tsx` — `PageHeader` (~l.126) dostaje `icon={<CompanyLogo size="md" ... />}`.
- `src/app/page.tsx` — dashboard: `CompanyLogo size="sm"` tam, gdzie ticker jest elementem listy (np. badge listy spółek ~l.152). `AllocationDonut` (~l.367) to wykres — **pomijamy** (nie lista). Ograniczyć się do realnych list.
- Strony wołają raz `getLogoFlags(ids)` i przekazują `hasLogo` (wzorzec mapy `quotes` w `watchlist/page.tsx`).

**Konfiguracja**
- `.env` / dokumentacja — `BRANDFETCH_CLIENT_ID` (opcjonalny; bez niego łańcuch startuje od Wikidata).

## Kryteria akceptacji

- [ ] Przy tickerze widać logo lub awatar z inicjałami — nigdy puste miejsce — we wszystkich tabelach/kartach portfela (Pozycje, Transakcje, Zrealizowane, Dywidendy), na watchliście, w nagłówku spółki i na dashboardzie.
- [ ] Kliknięcie „Odśwież ceny” odświeża też status logo (bez osobnego przycisku); błąd pobrania logo nie przerywa odświeżenia cen.
- [ ] Spółka bez trafienia w żadnym źródle pokazuje deterministyczny awatar (ten sam kolor przy każdym renderze dla tego samego tickera).
- [ ] Logo pobierane jest raz i serwowane z lokalnego cache (`/api/companies/[id]/logo`); powtórne rendery nie biją w zewnętrzne API (widoczne w logach/network).
- [ ] `BRANDFETCH_CLIENT_ID` ustawiony → logo z Brandfetch dla znanej domeny; nieustawiony → aplikacja działa, logo z Wikidata/Google/awatar.
- [ ] Dodanie/edycja spółki z domeną wyzwala pobranie logo (best-effort, nie blokuje zapisu przy błędzie sieci).
- [ ] Widok mobilny (~360–390px): logo w kartach nie psuje layoutu, brak poziomego scrolla; desktop bez regresji.
- [ ] Migracja `domain` i tabela `company_logos` powstają na świeżej bazie (BOOTSTRAP) i na istniejącej (ALTER) — build z wieloma workerami nie wywala `SQLITE_BUSY`.
- [ ] `npm run lint` i `npm run build` przechodzą; feature działa w preview.

## Ryzyka

- **Brandfetch wymaga `client id`** (zweryfikowane) i „fair use” bez twardego limitu — bez klucza PRIMARY nie działa; z kluczem trzeba pilnować, że sekret jest tylko server-side (env, nie w kliencie). Cache lokalny minimalizuje liczbę requestów.
- **Pokrycie GPW.** Brandfetch/Google są US-centryczne; dla polskich spółek kluczowa jest gałąź Wikidata (P154) i poprawna domena w `TICKER_DOMAINS`/`company.domain`. Złe dopasowanie encji Wikidata po nazwie (kolizje) → możliwe błędne logo; ograniczyć do wyników o wysokim dopasowaniu, w razie wątpliwości → awatar.
- **`output: "standalone"` a `public/`.** Dlatego cache jest w `DATA_DIR` i serwowany route handlerem (jak załączniki), a nie z `public/` — inaczej logo dawałyby 404 na produkcji.
- **Cache route handlera w Next 16.** GET route handlery mają w nowym Next inne domyślne cache'owanie niż w starym — **zweryfikować w `node_modules/next/dist/docs/`** (route handlers), czy nie trzeba `export const dynamic`/`revalidate`; wzorować się na działającym `attachments/[id]/route.ts`.
- **Google favicon** zwraca czasem generyczną kulę ziemską zamiast logo — akceptowalne jako trzeci fallback, ale wizualnie słabe; kolejność łańcucha (Wikidata przed Google) to łagodzi dla PL.
- **Sniffing/rozmiar.** Zewnętrzne źródła mogą zwrócić HTML/SVG/olbrzymi obraz — walidować Content-Type + magic bytes (`sniffImageMime`) i limit rozmiaru; SVG rozważyć osobno (sharp radzi sobie z rasteryzacją, ale uważać na fonty — patrz notatka w planie PWA).
- **Layout-shift / wydajność listy.** Wiele `<img loading="lazy">` w długiej tabeli — stały rozmiar kontenera i lazy-load; awatar renderowany natychmiast dla `hasLogo=false`.
- **Migracja DB.** Bezwzględnie trzymać się wzorca `migrateCompanyType` (read-only guard + re-check w transakcji) — inaczej równoległe workery `next build` dają `duplicate column` / `SQLITE_BUSY`.

## Decyzje (runda doprecyzowania)

- **Brandfetch client id** — na start **bez klucza**. Łańcuch startuje od Wikidata → Google favicon → awatar. `BRANDFETCH_CLIENT_ID` zostaje jako opcjonalny env var, który w każdej chwili można dopisać bez zmian w kodzie (Brandfetch stanie się PRIMARY automatycznie, gdy zmienna jest ustawiona).
- **Zasięg logo — WSZĘDZIE**, łącznie z tabelami Transakcje/Zrealizowane/Dywidendy w `portfolio/page.tsx` (nie tylko Pozycje/Watchlista/nagłówek). Każde miejsce, gdzie renderowany jest ticker w liście/tabeli, dostaje `CompanyLogo size=”sm”`.
- **Akcja odświeżania** — logo odświeża się razem z cenami: dołożyć `refreshLogos()` do istniejącego przycisku/route „Odśwież ceny” (`RefreshQuotesButton` / `src/app/api/quotes/refresh/route.ts` lub odpowiednika), zamiast osobnego przycisku. Osobny route `POST /api/logos/refresh` z sekcji „Pliki do zmiany” **odpada** — logikę `refreshLogos()` wywołujemy z wnętrza istniejącego route'a odświeżania cen (best-effort, błędy logo nie blokują odświeżenia cen).
- **Scheduler** — logo **nie** wchodzi do `src/lib/scheduler.ts`. Tylko on-demand: przy tworzeniu/edycji spółki (best-effort) + przy ręcznym „Odśwież ceny” (patrz wyżej).
- **Upload/nadpisanie logo per spółka** — pozostaje non-goal, do rozważenia w osobnym featurze później.
- **Rozmiar/format cache'u** — normalizacja przez `sharp` do **128px** (kwadrat, PNG), zgodnie z rekomendacją w „Podejście” pkt 2.
- **Seed `TICKER_DOMAINS`** — brak w repo realnych danych portfela (świeże środowisko, pusta baza), więc wykonawca seeduje mapę rozsądną listą dobrze znanych spółek jako start (kilkanaście WIG20: PKN, CDR, PZU, PKO, PEO, KGH, DNP, LPP, ALE, CCC, JSW, PGE, PGN, SPL, OPL… → ich domeny, plus kilka popularnych US: AAPL, MSFT, GOOGL, AMZN, TSLA, NVDA, META). Lista **nieblokująca** — spółki spoza mapy i tak dostają logo przez pole `domain` (edytowalne w `CompanyForm`) albo przez Wikidata po nazwie; mapa to tylko wygodny domyślny start.
