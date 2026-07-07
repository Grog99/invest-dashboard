# Scalanie duplikatów newsów między feedami

> Plan wygenerowany przez skill `/plan-feature`. Slug: `scalanie-duplikatow-newsow`. Branch: `feature/scalanie-duplikatow-newsow`.

## Kontekst / Problem

Ten sam artykuł Bankiera trafia do bazy wielokrotnie. Feedy `gielda.xml`, `wiadomosci.xml` i `espi.xml` publikują ten sam materiał pod różnymi URL-ami, a deduplikacja w `refreshNews()` (`src/lib/news.ts`) opiera się wyłącznie o `news_items.url UNIQUE` (kolumna `url` w `src/db/schema.ts:105`, insert z `.onConflictDoNothing({ target: newsItems.url })` w `src/lib/news.ts:219`). Różne URL-e → różne wiersze → duplikaty na liście newsów.

Skutki:
- Zaśmiecona lista newsów (`src/app/news/page.tsx` przez `listNews()`).
- Gorszy kontekst AI: `buildCompanyContext()` w `src/lib/ai.ts:66-77` bierze 15 ostatnich newsów spółki (`.limit(15)`) — duplikaty wypychają unikalne treści z okna kontekstu.

Cel: przed insertem wykrywać duplikat po znormalizowanym tytule + dniu publikacji (dodatkowa kolumna `dedup_key` z indeksem UNIQUE), a istniejące duplikaty scalić jednorazowo przy starcie aplikacji. Dedup ma być całkowicie cichy — bez zmian w UI.

## Wymagania

- Nowa kolumna `news_items.dedup_key TEXT` z indeksem **UNIQUE**, wartość = `lower(trim(title)) + '|' + published_at.slice(0,10)` (dokładnie ten dzień, bez tolerancji ±1).
- Insert nowych newsów w `refreshNews()` używa `onConflictDoNothing` łapiącego zarówno konflikt na `url`, jak i na `dedup_key`.
- Przy trafieniu w istniejący wiersz (konflikt) — **nie pomijać matchingu**, tylko doklejać ewentualne brakujące dopasowania firm do już istniejącego (kanonicznego) wiersza w `news_company` (analogicznie do dzisiejszego `onConflictDoNothing()` na `news_company`).
- Jednorazowy backfill przy starcie: policzyć `dedup_key` dla istniejących wierszy, scalić już istniejące duplikaty (zachować najstarszy wiersz, przenieść brakujące dopasowania `news_company`, usunąć nadmiarowe wiersze), a na końcu założyć indeks UNIQUE.
- Normalizacja tytułu: podstawowa — `lower(trim(title))`, bez usuwania interpunkcji/diakrytyków.
- Zero zmian w UI (cichy dedup) — brak wskaźnika „wiele źródeł".
- Migracja i backfill muszą być **idempotentne** (bootstrap `createDb()` wykonuje się przy każdym starcie procesu i przy każdym HMR w dev — patrz singleton `globalThis.__investDb` w `src/db/index.ts:124-130`).

## Zakres i Non-goals

**W zakresie:**
- Schemat: kolumna `dedup_key` + UNIQUE index (`src/db/schema.ts` i `BOOTSTRAP_SQL` w `src/db/index.ts` — trzymane w synchronie wg ADR-003 w `context/decisions.md`).
- Migracja/backfill/scalanie duplikatów w bootstrapie `createDb()` (`src/db/index.ts`).
- Zmiana logiki insertu i matchingu w `refreshNews()` (`src/lib/news.ts`).
- Współdzielony, czysty helper `computeDedupKey()` używany zarówno przy backfillu, jak i w runtime (parytet normalizacji).

**Non-goals (świadomie pomijamy):**
- Jakikolwiek wskaźnik „wiele źródeł" / lista alternatywnych URL-i w UI.
- Tolerancja czasowa ±1 dzień (dedup tylko dla dokładnie tego samego dnia).
- Zaawansowana normalizacja tytułu (usuwanie interpunkcji, diakrytyków, kolejności słów).
- Rematch istniejących newsów po dodaniu spółki/aliasu — to osobny punkt roadmapy 1.5.
- Migracja na system migracji Drizzle Kit — zostajemy przy wzorcu bootstrap SQL (ADR-003).

## Podejście

**Uwaga o regule z `AGENTS.md`:** feature nie dotyka żadnego API Next.js. Route `POST /api/news/refresh` (`src/app/api/news/refresh/route.ts`) tylko woła `refreshNews()` — jego sygnatura się nie zmienia; `src/app/api/news/route.ts` robi wyłącznie `PATCH`/`DELETE` i **nie** insertuje do `news_items`. Zmiany są w warstwie lib/db (better-sqlite3 + Drizzle), nie w handlerach. Dlatego nie ma potrzeby czytać `node_modules/next/dist/docs/` — nie zakładamy niczego o API Next.js.

**Kluczowa decyzja — jeden helper normalizacji zamiast SQL `lower()`.** Backfillu **nie** liczymy w czystym SQL. Powód (pułapka wykryta w kodzie): wbudowane `lower()` w SQLite (better-sqlite3 bez ICU) zmienia tylko ASCII A–Z, a runtime używa JS `String.prototype.toLowerCase()`, który poprawnie zmienia też polskie wielkie litery (np. `Ł`→`ł`, `Ó`→`ó`). Gdyby backfill liczył klucz przez `lower()`, a runtime przez `toLowerCase()`, ten sam artykuł dostałby **różne** `dedup_key` w zależności od tego, czy powstał w backfillu, czy przy odświeżeniu — i dedup by nie zadziałał dla tytułów z wielkimi polskimi znakami. Dlatego wprowadzamy jeden czysty helper:

```ts
export function computeDedupKey(title: string, publishedAt: string | null): string | null {
  const t = title.trim().toLowerCase();
  const day = (publishedAt ?? "").slice(0, 10);
  if (!t || day.length < 10) return null; // brak daty → nie deduplikujemy po kluczu, tylko po url
  return `${t}|${day}`;
}
```

- Zwraca `null`, gdy `published_at` jest puste/niepełne (`parseFeed()` potrafi zwrócić `publishedAt: null` — `src/lib/news.ts:98,127`). `null` w indeksie UNIQUE SQLite jest traktowany jako wartość odrębna (wiele `NULL` może współistnieć), więc newsy bez daty deduplikują się wyłącznie po `url` — tak jak dziś.
- Helper trafia do **`src/lib/format.ts`** (moduł-liść, bez importu `@/db`; `src/lib/news.ts` już importuje z niego `nowISO`). Dzięki temu import z `src/db/index.ts` **nie** tworzy cyklu `db ↔ news` (gdyby helper był w `news.ts`, byłby cykl, bo `news.ts` importuje z `@/db`).

**Insert w runtime — `onConflictDoNothing()` bez targetu.** Zmieniamy `.onConflictDoNothing({ target: newsItems.url })` na `.onConflictDoNothing()` (bez celu). W SQLite `ON CONFLICT DO NOTHING` bez targetu łapie naruszenie **dowolnego** UNIQUE (i `url`, i `dedup_key`) — to prostsze i odporniejsze niż celowanie w `dedup_key`, które przy jednoczesnym konflikcie na `url` bywa kruche. Gdy insert nic nie zwróci (konflikt), odszukujemy kanoniczny wiersz i doklejamy do niego dopasowania firm:
- lookup po `dedup_key`, gdy niepusty (łapie oba przypadki konfliktu: ten sam URL ponownie pobrany **oraz** ten sam artykuł z innego feedu — obie sytuacje mają identyczny `dedup_key`),
- fallback po `url`, gdy `dedup_key` jest `null`.

To zmienia dotychczasowe zachowanie: dziś przy `!inserted` kod robi `continue` (`src/lib/news.ts:223`) i pomija matching. Po zmianie matching wykonuje się **także** przy konflikcie — to celowe i wymagane (doklejenie brakujących dopasowań). Koszt: matcher przelicza się dla powtarzających się pozycji feedu przy każdym odświeżeniu; przy ~kilkudziesięciu itemach na feed jest to pomijalne, a wszystkie inserty do `news_company` i tak idą z `onConflictDoNothing()`.

**Migracja jako osobna funkcja JS po `sqlite.exec(BOOTSTRAP_SQL)`.** Bootstrap SQL to seria idempotentnych `CREATE ... IF NOT EXISTS`. `ALTER TABLE ADD COLUMN` **nie** jest idempotentny (rzuca „duplicate column name" przy powtórzeniu) i SQLite **nie pozwala** dodać kolumny UNIQUE przez `ALTER TABLE` — dlatego kolumnę dodajemy zwykłym `ALTER`, a indeks UNIQUE zakładamy osobno, dopiero po scaleniu duplikatów. Całość ląduje w nowej funkcji `migrateNewsDedup(sqlite)` wołanej w `createDb()` między `sqlite.exec(BOOTSTRAP_SQL)` (`src/db/index.ts:120`) a `return drizzle(...)`. Operuje surowym uchwytem `better-sqlite3` (`sqlite`), całość w jednej transakcji (`sqlite.transaction(fn)()`) — atomowo i z twardym błędem startu, gdyby dane były niespójne.

## Pliki do zmiany

- **`src/lib/format.ts`** — dodać eksport `computeDedupKey(title, publishedAt)` (jak wyżej). Moduł czysty, bez `@/db` → bezpieczny do importu z `src/db/index.ts` i `src/lib/news.ts`.
  - Reużyj/współdziel: ten sam helper woła backfill i runtime (parytet normalizacji).

- **`src/db/schema.ts`** — w definicji `newsItems` (obecnie `src/db/schema.ts:99-110`) dodać kolumnę `dedupKey: text("dedup_key")` oraz trzeci argument `sqliteTable` z `uniqueIndex("idx_news_dedup").on(t.dedupKey)` (import `uniqueIndex` z `drizzle-orm/sqlite-core`). To źródło typów dla Drizzle i `target`/kolumny w zapytaniach; faktyczny DDL i tak wykonuje bootstrap. Trzymanie w synchronie z `BOOTSTRAP_SQL` wymagane przez ADR-003 (`context/decisions.md:55`).

- **`src/db/index.ts`:**
  1. W `BOOTSTRAP_SQL` w `CREATE TABLE IF NOT EXISTS news_items (...)` (`src/db/index.ts:82-91`) dopisać kolumnę `dedup_key TEXT` (dla świeżych instalacji tabela od razu ma kolumnę; **nie** dodajemy tu `UNIQUE INDEX`, bo dla istniejącej bazy kolumna jeszcze nie istnieje w momencie `exec`). Indeks zakłada `migrateNewsDedup()`.
  2. Import `computeDedupKey` z `@/lib/format` (albo relatywnie `../lib/format`).
  3. Nowa funkcja `migrateNewsDedup(sqlite: Database.Database)` (kolejność operacji — patrz niżej), wywołana w `createDb()` zaraz po `sqlite.exec(BOOTSTRAP_SQL)` (`src/db/index.ts:120`), przed `return drizzle(...)`. `foreign_keys = ON` jest już ustawione (`src/db/index.ts:119`), więc kaskada działa.
  - Reużyj: wzorzec singletona `globalThis.__investDb` (`src/db/index.ts:124-130`) gwarantuje, że `createDb()` (a więc i migracja) odpali się raz na proces — dlatego migracja musi być idempotentna, ale nie martwimy się współbieżnością.

- **`src/lib/news.ts` — `refreshNews()` (`src/lib/news.ts:192-257`), pętla po `items` (`src/lib/news.ts:208-240`):**
  1. Import `computeDedupKey` z `./format`.
  2. Przed insertem: `const dedupKey = computeDedupKey(item.title, item.publishedAt);`
  3. Do `.values({...})` (`src/lib/news.ts:211-218`) dodać `dedupKey`.
  4. Zmienić `.onConflictDoNothing({ target: newsItems.url })` (`src/lib/news.ts:219`) na `.onConflictDoNothing()` (bez targetu).
  5. Zamiast `if (!inserted) continue;` (`src/lib/news.ts:223`) — wyznaczyć `newsId`:
     ```ts
     let newsId: number;
     if (inserted) {
       newsId = inserted.id;
       result.inserted++;
     } else {
       const existing = db
         .select({ id: newsItems.id })
         .from(newsItems)
         .where(dedupKey ? eq(newsItems.dedupKey, dedupKey) : eq(newsItems.url, item.url))
         .get();
       if (!existing) continue; // rzadki edge (np. ten sam url, zmieniony tytuł) — pomijamy
       newsId = existing.id;
     }
     ```
  6. Blok matchingu (`src/lib/news.ts:226-239`) zostaje, ale insertuje `news_company` z użyciem `newsId` zamiast `inserted.id`. Insert do `news_company` już jest z `.onConflictDoNothing()` (`src/lib/news.ts:235-238`) — bez zmian.
  - Reużyj: `buildMatchers()` / `matchCompanies()` (`src/lib/news.ts:158-184`) bez zmian; `source.companyId` dokładany jak dziś (`src/lib/news.ts:228-230`).

**Logika `migrateNewsDedup(sqlite)` — dokładna kolejność (wszystko w jednej transakcji):**

1. **Kolumna (idempotentnie):** sprawdź `PRAGMA table_info(news_items)`; jeśli brak kolumny `dedup_key`, wykonaj `ALTER TABLE news_items ADD COLUMN dedup_key TEXT`. (Na świeżej bazie kolumna już jest z `CREATE TABLE` → `ALTER` pomijany.)
   ```ts
   const cols = sqlite.prepare(`PRAGMA table_info(news_items)`).all() as { name: string }[];
   if (!cols.some((c) => c.name === "dedup_key")) {
     sqlite.exec(`ALTER TABLE news_items ADD COLUMN dedup_key TEXT`);
   }
   ```
2. **Backfill w JS (parytet z runtime):** dla wierszy z `dedup_key IS NULL AND published_at IS NOT NULL` policz klucz `computeDedupKey(title, published_at)` i zapisz `UPDATE ... SET dedup_key = ? WHERE id = ?` (przygotowany statement w pętli; przy `null` z helpera po prostu nie ustawiamy). Warunek `dedup_key IS NULL` czyni krok idempotentnym (przy kolejnym starcie policzone klucze już są).
   - Uwaga: **nie** liczyć tego w SQL przez `lower()` — patrz „Kluczowa decyzja" (ASCII-only `lower()` łamie parytet dla polskich wielkich liter).
3. **Scalanie istniejących duplikatów (SQL, na policzonych już kluczach):**
   - a. Przenieś brakujące dopasowania z duplikatów do kanonicznego (najstarszego = `MIN(id)`) wiersza w grupie o tym samym `dedup_key`. `INSERT OR IGNORE` omija konflikt PK `(news_id, company_id)`:
     ```sql
     INSERT OR IGNORE INTO news_company (news_id, company_id)
     SELECT keep.min_id, nc.company_id
     FROM news_company nc
     JOIN news_items ni ON ni.id = nc.news_id
     JOIN (
       SELECT dedup_key, MIN(id) AS min_id
       FROM news_items
       WHERE dedup_key IS NOT NULL
       GROUP BY dedup_key
     ) keep ON keep.dedup_key = ni.dedup_key
     WHERE nc.news_id <> keep.min_id;
     ```
   - b. Usuń nadmiarowe wiersze (wszystkie poza `MIN(id)` w grupie). FK `news_company.news_id → news_items(id) ON DELETE CASCADE` (`src/db/schema.ts:116-118`) usunie ich (już skopiowane) dopasowania — dlatego kopiowanie (a) **przed** kasowaniem (b):
     ```sql
     DELETE FROM news_items
     WHERE dedup_key IS NOT NULL
       AND id NOT IN (
         SELECT MIN(id) FROM news_items WHERE dedup_key IS NOT NULL GROUP BY dedup_key
       );
     ```
   - Do `news_items` odwołuje się (FK) wyłącznie `news_company` — inne tabele (`notes`, `news_sources`) nie wskazują na `news_items`, więc kaskada nie dotyka nic poza `news_company`.
4. **Indeks UNIQUE (idempotentnie), dopiero po scaleniu:**
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_news_dedup ON news_items(dedup_key);
   ```
   Zakładany na końcu, bo przed scaleniem istniałyby zduplikowane `dedup_key` i utworzenie indeksu by się wywaliło. Jeśli po (3) jakiś duplikat by został (błąd logiki), `CREATE UNIQUE INDEX` rzuci — transakcja się wycofa, a start aplikacji zawiedzie głośno (pożądane, zamiast cichego rozjazdu).

## Kryteria akceptacji

- [ ] `npm run lint` i `npm run build` (typecheck) przechodzą.
- [ ] Świeża baza (usunięty `data/invest.db`): aplikacja startuje, `news_items` ma kolumnę `dedup_key` i indeks `idx_news_dedup` (`PRAGMA index_list(news_items)`), `POST /api/news/refresh` działa.
- [ ] Istniejąca baza z duplikatami: po starcie liczba wierszy `news_items` z tym samym `computeDedupKey` spada do 1 na grupę; kanoniczny wiersz to najstarszy (`MIN(id)`); dopasowania `news_company` z usuniętych duplikatów są obecne na wierszu kanonicznym (suma dopasowań zachowana, bez PK-duplikatów).
- [ ] Ponowne `POST /api/news/refresh` (bez zmian w feedach) nie tworzy nowych wierszy `news_items` (te same artykuły z różnych feedów Bankiera → jeden wiersz), a `result.inserted` = 0 dla powtórek.
- [ ] Artykuł obecny w dwóch feedach, gdzie drugi feed taguje inną spółkę (lub `source.companyId`), doprowadza do doklejenia brakującego dopasowania w `news_company` do wiersza kanonicznego (bez nowego wiersza).
- [ ] Restart aplikacji drugi raz: migracja idempotentna (żaden `ALTER`/scalanie nie rzuca, brak zmian w danych).
- [ ] Tytuł z polskimi wielkimi literami (np. zawierający `Ł`/`Ó`) deduplikuje się identycznie niezależnie od tego, czy wiersz powstał w backfillu, czy przy odświeżeniu (parytet `computeDedupKey`).
- [ ] Newsy bez `published_at` nie są błędnie scalane po pustym kluczu — deduplikują się tylko po `url`.

## Ryzyka

- **Parytet normalizacji (SQLite `lower()` vs JS `toLowerCase()`).** ASCII-only `lower()` w better-sqlite3 rozjeżdża klucze dla polskich diakrytyków. Mitygacja: jeden helper `computeDedupKey` liczony w JS zarówno w backfillu, jak i runtime. **Nie** wprowadzać SQL-owego `lower(trim(title))` w backfillu.
- **Idempotencja bootstrapu.** `createDb()` odpala się przy każdym starcie i HMR. `ALTER TABLE ADD COLUMN` musi być pod strażą `PRAGMA table_info`, backfill pod warunkiem `dedup_key IS NULL`, indeks przez `IF NOT EXISTS`. Całość w transakcji.
- **Kolejność vs FK.** Kopiowanie dopasowań (`INSERT OR IGNORE`) musi iść **przed** `DELETE FROM news_items` — inaczej kaskada `ON DELETE CASCADE` skasuje dopasowania duplikatu, zanim je przeniesiemy.
- **Ograniczenie `ALTER TABLE` w SQLite.** Nie można dodać kolumny z inline `UNIQUE` — dlatego indeks osobno, po scaleniu.
- **Konflikt na dwóch UNIQUE naraz.** Użycie `onConflictDoNothing()` bez targetu jest świadome — celowanie tylko w `dedup_key` bywa kruche przy jednoczesnym konflikcie `url`.
- **Rzadki edge: ten sam `url`, zmieniony tytuł/data.** Wtedy konflikt jest na `url`, a nowy `dedup_key` nie wskaże istniejącego wiersza → w gałęzi `else` `existing` może być puste i pozycję pomijamy (`continue`). Stary wiersz zachowuje dotychczasowe dopasowania; wpływ pomijalny.
- **Pułapki źródeł (Bankier RSS).** Tytuły przechodzą przez `stripHtml()` (`src/lib/news.ts:27-56`) — normalizacja bazuje na już oczyszczonym tytule, więc dwa feedy dające ten sam (oczyszczony) tytuł i dzień dają ten sam klucz. Jeśli feedy różnią się wielkością liter/spacjami w tytule — `lower(trim())` to niweluje; różnice interpunkcyjne (świadomy non-goal) mogą sporadycznie nie scalić — akceptowalne.
- **Koszt matchingu przy konflikcie.** Matcher liczony teraz także dla powtórek feedu; przy typowych rozmiarach feedów pomijalny.

## Pytania do doprecyzowania

Brak otwartych pytań. Wszystkie decyzje rozstrzygnięte:

- Backfill istniejących duplikatów: TAK, jednorazowo przy starcie.
- Normalizacja tytułu: podstawowa (`lower(trim(title))`).
- UX: całkowicie cichy dedup, zero zmian w UI.
- Okno czasowe: dokładnie ten sam dzień (`published_at.slice(0,10)`), bez tolerancji ±1.
- **Newsy bez `published_at`:** potwierdzone — `dedup_key = null`, taki wiersz deduplikuje się **tylko po `url`** (jak dziś), bez scalania między feedami. Alternatywa (klucz z samego tytułu bez daty) odrzucona — ryzyko sklejenia różnych artykułów o identycznym/generycznym tytule (np. cykliczne „Podsumowanie sesji").
