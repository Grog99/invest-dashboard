# Retencja newsów — limit wiadomości per spółka i dla newsów ogólnych

> Plan wygenerowany przez skill `/plan-feature`. Slug: `news-message-retention-limits`. Branch: `claude/news-message-retention-limits-qwk1br`.

## Kontekst / Problem

Tabela `news_items` rośnie w nieskończoność — każdy przebieg `refreshNews()` (ręczny `POST /api/news/refresh` i cron `news`) tylko dokłada wiersze, a jedyny mechanizm czyszczenia to ręczny `DELETE /api/news`, który kasuje **wszystko** (`src/app/api/news/route.ts:69-73`). Nie ma żadnej logiki retencji/prune. W efekcie baza `data/invest.db` puchnie, a stare, nieistotne komunikaty zostają na zawsze.

Użytkownik chce automatycznej retencji opartej na limicie liczby wiadomości:

- **max 20 najnowszych wiadomości o danej spółce** — starsze ponad limit usuwamy,
- **osobno max 20 najnowszych wiadomości „ogólnych"** (niepowiązanych z żadną spółką) — starsze ponad limit usuwamy.

Czyszczenie ma dziać się **inline, przy każdym zapisie nowych newsów** (w tej samej operacji co insert/matching), a nie osobnym cronem. Limit ma być **konfigurowalny w Ustawieniach** (nie hardcoded). Usuwanie **twarde** (hard `DELETE`), operacja **cicha** (bez logów/UI).

## Wymagania

**Funkcjonalne:**

- Po każdym przebiegu `refreshNews()` liczba wierszy `news_company` dla każdej spółki, która dostała nowy news w tym przebiegu, jest przycięta do **N najnowszych** (domyślnie N = 20); nadmiarowe powiązania są usuwane.
- Liczba newsów „ogólnych" (0 wierszy w `news_company`) jest przycięta do **N najnowszych**; nadmiarowe `news_items` są twardo usuwane.
- Limit N jest wspólną, konfigurowalną wartością w Ustawieniach (jedna liczba dla obu pul — potwierdzone z użytkownikiem), z domyślną wartością **20** i walidacją (dodatnia liczba całkowita).
- „Najnowsze" liczone spójnie z resztą kodu: `ORDER BY coalesce(published_at,'') DESC, id DESC` (ten sam porządek totalny co `listNews()` i indeks `idx_news_published_id`).
- Usuwanie twarde (`DELETE`), nie soft-delete. Kasacja `news_items` kaskadowo usuwa jego wiersze `news_company` (FK `ON DELETE CASCADE`).
- Operacja cicha — bez dodatkowego logowania ani sygnalizacji w UI.

**Niefunkcjonalne:**

- Retencja odpala się **inline** w `refreshNews()` (jeden przebieg per refresh, nie per-item), bez osobnego crona.
- Deterministyczna i idempotentna: ponowne uruchomienie na już przyciętej bazie nie zmienia niczego.
- Brak zauważalnego narzutu — zapytania przycinające są indeksowalne i ograniczone (mała liczba spółek w dashboardzie osobistym).

## Zakres i Non-goals

**W zakresie:**

- Nowa czysta funkcja domenowa `pruneNewsRetention()` w `src/lib/news.ts` + wpięcie jej w `refreshNews()`.
- Nowe ustawienie `newsRetentionLimit` (klucz w tabeli `settings`, wzorzec `cronNews`/`DEFAULT_CRON`) + helper odczytu/parsowania w `src/lib/settings.ts`.
- Walidacja i zapis limitu w `GET`/`POST /api/settings`.
- Pole edycji limitu w Ustawieniach (`/settings`) — nowy mały formularz kliencki.
- Jednorazowa konwergencja istniejących baz (przycięcie zaległego backlogu) — patrz „Podejście".

**Non-goals (świadomie pomijamy):**

- Osobny cron/scheduler dla retencji (użytkownik jawnie chce inline).
- Soft-delete / archiwizacja / kosz.
- Logowanie, metryki, UI pokazujące co zostało usunięte.
- Zmiana schematu tabel `news_items` / `news_company` (retencja nie wymaga nowych kolumn; limit ląduje w istniejącej tabeli `settings`).
- Dwa osobne limity (per-spółka vs ogólne) jako oddzielne pola — użytkownik potwierdził jedną wspólną wartość.
- Zmiany w widokach list newsów (dashboard/`/news`/strona spółki/watchlist) — żaden z nich nie zakłada > 20 wpisów historycznych (weryfikacja niżej).

## Podejście

### Model danych (przypomnienie, zweryfikowane w `src/db/schema.ts`)

- `news_items` (`news_items`, `src/db/schema.ts:114-133`): `id`, `publishedAt` (nullable), `read`, ..., `dedupKey`. Indeks wyrażeniowy `idx_news_published_id` na `coalesce(published_at,'') DESC, id DESC` (`src/db/index.ts:101`).
- `news_company` (`news_company`, `src/db/schema.ts:136-147`): join M:N, PK złożony `(newsId, companyId)`. **Oba FK mają `ON DELETE CASCADE`**: `newsId → news_items.id` (`schema.ts:141`) i `companyId → companies.id` (`schema.ts:144`). Pragma `foreign_keys = ON` jest ustawiona w `createDb()` (`src/db/index.ts:374`) → **usunięcie wiersza `news_items` automatycznie kasuje jego wiersze `news_company`** (kierunek kaskady potwierdzony).
- „News ogólny" = news_item z **zerem** wierszy w `news_company`. To jest też dynamiczna definicja używana już dziś w `listNews()` przez `exists (select 1 from news_company ...)` (filtr `onlyMyCompanies`, `src/lib/news.ts:350-352`) — retencja musi być z nią spójna.

### Kluczowa decyzja: przypadek many-to-many

News może być powiązany z 0, 1 lub wieloma spółkami. „Limit 20 per spółka" naturalnie dotyczy **wierszy `news_company`** (nie całych `news_items`). Wybieramy deterministyczny, dwustopniowy algorytm (dokładnie ta kolejność):

**Krok 1 — przytnij powiązania per spółka.** Dla każdej spółki `C` dotkniętej w tym przebiegu usuń z `news_company` wiersze `C` **poza 20 najnowszymi** (ranking po `coalesce(published_at,'') DESC, id DESC` przez join do `news_items`). To usuwa tylko wiersze join, nie same `news_items`. News powiązany z A (pozycja 5) i B (pozycja 25) traci wiersz `(item, B)`, ale zachowuje `(item, A)` → item przeżywa jako news spółki A.

**Krok 2 — przytnij pulę ogólną (absorbuje sieroty).** Po kroku 1 zbiór newsów z **zerem** wierszy `news_company` = newsy pierwotnie ogólne **∪** „sieroty" (itemy, którym krok 1 usunął ostatnie powiązanie). Usuwamy z `news_items` wszystkie takie itemy **poza 20 najnowszymi** (ten sam ranking). To jeden `DELETE ... WHERE NOT EXISTS(powiązanie) AND id NOT IN (top-20 ogólnych)`.

**Rozstrzygnięcie sieroty (item traci ostatnie powiązanie w kroku 1) — potwierdzone z użytkownikiem:** taki item **„spada" do puli ogólnej** i podlega limitowi ogólnemu — przeżywa wtedy i tylko wtedy, gdy mieści się w top-20 najnowszych ogólnych, inaczej zostaje twardo usunięty w kroku 2. Uzasadnienie: (a) upraszcza algorytm do dwóch instrukcji SQL bez śledzenia „kto był sierotą", (b) jest spójne z istniejącą, dynamiczną definicją „ogólny = 0 wierszy `news_company`" używaną w `listNews()`. Znany efekt uboczny (udokumentowany w „Ryzyka"): świeży news, który wypadł z top-20 **wszystkich** swoich spółek, ale jest wciąż w top-20 puli ogólnej, może na krótko pojawić się w ogólnym feedzie bez tagu spółki, zanim wypadnie i z niej.

Dlaczego nie „usuwać sieroty od razu" (odrzucona alternatywa): wymaga zebrania id sierot **przed** przycięciem (po przycięciu sierota jest nieodróżnialna od newsa pierwotnie ogólnego — obie mają 0 wierszy join), co dokłada kod i stan; korzyść (brak resurfacingu) jest kosmetyczna przy krótkim oknie retencji.

**Determinizm / NULL `published_at`:** `coalesce(published_at,'')` mapuje brak daty na `''`, które w porządku `DESC` jest najmniejsze → newsy bez daty są traktowane jako najstarsze (dół listy) i przycinane pierwsze — dokładnie tak, jak są dziś wyświetlane w `listNews()`. Tie-break po `id DESC`. Porządek jest totalny, więc top-20 jest jednoznaczne.

### Kiedy i jak wołać

- W `refreshNews()` (`src/lib/news.ts:192-276`) akumulujemy w trakcie pętli matchingu `Set<number>` **dotkniętych companyId** (każde `companyId`, dla którego próbowaliśmy wstawić wiersz `news_company` — zarówno ścieżka insertu, jak i konfliktu/dedupu, `src/lib/news.ts:253-258`). Po zakończeniu pętli po źródłach wołamy **raz** `pruneNewsRetention(affected)`.
- Spółki, które nie dostały nowego newsa, nie mogą przekroczyć limitu → nie trzeba ich przycinać (optymalizacja). Pulę ogólną (krok 2) uruchamiamy **zawsze** raz na refresh (jest tania i może dojść nowy news ogólny lub sierota).
- Całość kroku 1 + 2 owijamy w jedną transakcję better-sqlite3 (atomowość; wzorzec `sqlite.transaction()` z migracji `migrateNewsDedup`, `src/db/index.ts:215-271`) albo równoważnie sekwencją `db.run(sql\`...\`)` — SQLite jest single-writer, więc atomowość jest głównie dla spójności przy błędzie w połowie.

### Kształt zapytań (raw SQL przez drizzle `sql` + `db.run`, wzorzec `src/app/api/health/route.ts:9`)

Krok 1 (dla każdego `companyId = :c`, `:limit` = N):

```sql
DELETE FROM news_company
WHERE company_id = :c
  AND news_id NOT IN (
    SELECT nc.news_id
    FROM news_company nc
    JOIN news_items ni ON ni.id = nc.news_id
    WHERE nc.company_id = :c
    ORDER BY coalesce(ni.published_at,'') DESC, ni.id DESC
    LIMIT :limit
  );
```

Krok 2 (raz):

```sql
DELETE FROM news_items
WHERE NOT EXISTS (SELECT 1 FROM news_company nc WHERE nc.news_id = news_items.id)
  AND id NOT IN (
    SELECT ni.id
    FROM news_items ni
    WHERE NOT EXISTS (SELECT 1 FROM news_company nc2 WHERE nc2.news_id = ni.id)
    ORDER BY coalesce(ni.published_at,'') DESC, ni.id DESC
    LIMIT :limit
  );
```

(Można zaimplementować też przez query builder drizzle z `notInArray`/podzapytaniem, ale raw `sql` jest tu czytelniejszy dla `ORDER BY ... LIMIT` w podzapytaniu; oba są idiomatyczne w repo.)

### Konwergencja istniejących baz (backfill retencji)

Inline-prune per-refresh przycina tylko spółki dotknięte w danym przebiegu, więc istniejący backlog nieaktywnej spółki nie zniknie, dopóki nie dostanie nowego newsa. Aby istniejące bazy skonwergowały od razu (potwierdzone z użytkownikiem), `pruneNewsRetention()` z **pustym/pominietym** argumentem robi **pełny przemiat** (wszystkie spółki mające jakiekolwiek `news_company` + pula ogólna). Wołamy taki pełny przemiat **raz przy starcie procesu** w `startScheduler()` (`src/lib/scheduler.ts:87-92`, wzorzec: idempotentny start) — tanie, deterministyczne, zbiega natychmiast. `refreshNews()` używa wersji inkrementalnej (tylko dotknięte spółki) w reżimie ustalonym.

### Ustawienie limitu (wzorzec `DEFAULT_CRON`, BEZ migracji schematu)

Limit trzymamy w istniejącej tabeli `settings` (k-v), więc **nie ma migracji schematu ani zmiany `BOOTSTRAP_SQL`** — wartość domyślna aplikowana przy odczycie (`getSetting(...) ?? DEFAULT`), dokładnie jak `cronNews`/`cronQuotes` (`src/lib/settings.ts:32-35`, `src/app/settings/page.tsx:25-26`). Nowy klucz `newsRetentionLimit`, stała `DEFAULT_NEWS_RETENTION_LIMIT = 20`, helpery `parseRetentionLimitSetting()` + `getNewsRetentionLimit()` (parytet z `parseTemperatureSetting` itd., `src/lib/settings.ts:88-105`).

### Next.js API

Brak nowej powierzchni API Next.js — feature reużywa istniejące wzorce: server-side lib (`refreshNews`/`pruneNewsRetention`), istniejący Route Handler `POST /api/settings` (rozszerzony), oraz kliencki formularz z `fetch` (kalka `ScheduleSettingsForm`). Route Handlery nie są cache'owane domyślnie (potwierdzone komentarzem w repo `src/app/api/news/route.ts:11-14`), więc nie trzeba `export const dynamic`. **Uwaga:** w tym środowisku `node_modules/next/dist/docs/` nie jest zainstalowane — implementator MUSI przeczytać właściwy przewodnik (`instrumentation.md`, route handlers) w środowisku z zależnościami przed dotknięciem `src/lib/scheduler.ts` / `src/instrumentation.ts` / route handlerów (zasada z `AGENTS.md`). Ten plan nie zakłada żadnego nowego API poza już użytymi w repo wzorcami.

## Pliki do zmiany

### Baza (warstwa danych)

- `src/db/schema.ts` — **brak zmian** (retencja nie potrzebuje kolumn; kaskada `ON DELETE CASCADE` na `news_company.newsId` już istnieje, `schema.ts:141`).
- `src/db/index.ts` — **brak zmian** (limit w tabeli `settings`, brak migracji/bootstrapu; kaskada działa dzięki `foreign_keys = ON`, `index.ts:374`).
- `src/lib/news.ts` — **główna zmiana warstwy danych**:
  - Nowa eksportowana funkcja `pruneNewsRetention(companyIds?: Iterable<number>)`: gdy podano zbiór — przycina te spółki (krok 1) i zawsze pulę ogólną (krok 2); gdy pominięto — pełny przemiat wszystkich spółek mających `news_company` + pula ogólna. Czyta limit przez `getNewsRetentionLimit()`. Owinięta w transakcję. Reużyj `sql` z `drizzle-orm` (już importowany, `src/lib/news.ts:14`) i `db.run(...)`.
  - W `refreshNews()`: akumuluj `Set<number>` dotkniętych `companyId` w pętli matchingu (`src/lib/news.ts:246-258`) i po pętli po źródłach wywołaj `pruneNewsRetention(affected)` raz. Import `getNewsRetentionLimit` z `@/lib/settings` (brak cyklu: `settings.ts` nie importuje `news.ts`).
- `src/lib/settings.ts` — dodaj:
  - `SETTING_KEYS.newsRetentionLimit: "news_retention_limit"` (`settings.ts:11-21`),
  - `export const DEFAULT_NEWS_RETENTION_LIMIT = 20;` (obok `DEFAULT_CRON`, `settings.ts:32-35`),
  - `parseRetentionLimitSetting(value: string | null): number` (dodatnia liczba całkowita; fallback do domyślnej; opcjonalny górny sanity-cap, np. ≤ 10000) i `getNewsRetentionLimit(): number` (odczyt + parse). Parytet z `parseTemperatureSetting`/`isValidTemperature` (`settings.ts:70-105`).

### Backend (warstwa backend)

- `src/app/api/settings/route.ts` — rozszerz:
  - `GET`: dodaj `newsRetentionLimit: getSetting(SETTING_KEYS.newsRetentionLimit) ?? String(DEFAULT_NEWS_RETENTION_LIMIT)` do odpowiedzi (`route.ts:17-30`).
  - `POST`: waliduj i zapisz `body.newsRetentionLimit` — dodatnia liczba całkowita, inaczej `400` (spójnie ze wzorcem walidacji cron/temperature, `route.ts:43-101`). **Nie** woła `reloadScheduler()` (retencja nie jest zaplanowana).
- `src/lib/scheduler.ts` — w `startScheduler()` (`scheduler.ts:87-92`) dołóż jednorazowy pełny przemiat: `pruneNewsRetention()` bez argumentów (konwergencja istniejących baz przy starcie procesu). Import z `@/lib/news`. Idempotentne i tanie. (Cron `news` już woła `refreshNews()`, które robi prune inkrementalny — bez zmian w definicji zadania.)
- `src/app/api/news/refresh/route.ts` — **brak zmian** (woła `refreshNews()`, które samo przycina po zapisie).
- `src/app/api/news/route.ts` — **brak zmian** (DELETE „wyczyść wszystko" i PATCH bez związku z retencją).

### Frontend (warstwa frontend)

- `src/components/NewsRetentionForm.tsx` — **nowy** mały formularz kliencki (kalka `src/components/ScheduleSettingsForm.tsx`): jedno pole liczbowe „Limit wiadomości (per spółka i ogólne)", `POST /api/settings` z `{ newsRetentionLimit }`, `router.refresh()`, komunikaty ok/błąd. Reużyj `Button`/`Input`/`Label` z `src/components/ui`. Responsywność: pojedynczy input w `max-w-xl` — trywialnie mobilny (~360–390px), zgodnie z regułą `AGENTS.md`; zweryfikuj wizualnie.
- `src/app/settings/page.tsx` — odczytaj `newsRetentionLimit` (`getSetting(SETTING_KEYS.newsRetentionLimit) ?? String(DEFAULT_NEWS_RETENTION_LIMIT)`) i wyrenderuj nowy `Card title="Retencja newsów"` z `<NewsRetentionForm limit={...} />`, najlepiej tuż po karcie „Źródła newsów (RSS)" (`page.tsx:64-70`). Wzorzec kart/importów jak istniejące (`page.tsx:11-16, 46-88`).
- Widoki list newsów — **brak zmian**. Weryfikacja: dashboard `listNews({ limit: 8 })` (`src/app/page.tsx:80`), strona spółki `listNews({ companyId, limit: 15 })` (`src/app/companies/[id]/page.tsx:112`), kontekst AI `limit(15)` per spółka (`src/lib/ai.ts:92-103`), `/news` infinite scroll `limit: 50` z kursorem keyset po **wszystkich** newsach (`src/app/news/page.tsx:27`, `src/app/api/news/route.ts:15-48`), widget unread na watchliście liczy `count(*)` z join (`src/app/watchlist/page.tsx:41-53`). Żaden nie zakłada > 20 wpisów historycznych per spółka/ogólne, więc limit 20 przycina historię pod obecną paginacją — bez zmian UI.

## Kryteria akceptacji

- [ ] Po `POST /api/news/refresh` żadna spółka nie ma więcej niż N (domyślnie 20) wierszy w `news_company`, a pula newsów ogólnych (0 wierszy join) nie przekracza N — sprawdzalne prostym `SELECT company_id, count(*) FROM news_company GROUP BY company_id` i zliczeniem newsów bez powiązań.
- [ ] News powiązany z wieloma spółkami przeżywa, dopóki jest w top-N choć jednej z nich; traci tylko wiersze join spółek, dla których wypadł z top-N.
- [ ] Item, który stracił ostatnie powiązanie, jest usuwany, chyba że mieści się w top-N ogólnych (zgodnie z decyzją „spada do puli ogólnej"); usunięcie `news_items` nie zostawia osieroconych wierszy `news_company` (kaskada).
- [ ] Ranking retencji zgadza się z `listNews()` (`coalesce(published_at,'') DESC, id DESC`); newsy bez daty przycinane jako najstarsze.
- [ ] Limit jest edytowalny w `/settings` (nowa karta „Retencja newsów"), zapis waliduje dodatnią liczbę całkowitą i persystuje w `settings`; niepoprawna wartość → `400`, nic nie zapisane.
- [ ] Istniejąca baza z backlogiem > N konwerguje przy starcie procesu (pełny przemiat w `startScheduler()`).
- [ ] Operacja jest cicha (brak nowych logów/UI) i idempotentna (drugi refresh bez nowych danych nic nie usuwa).
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się; po ustawieniu limitu np. na 5 i refreshu widok spółki/ogólny pokazuje maks. 5 najnowszych (zweryfikowane w preview).

## Ryzyka

- **Twarde usuwanie nieprzeczytanych.** Retencja kasuje po recency, ignorując `read` — bardzo aktywna spółka może „zjeść" nieprzeczytane newsy, zanim użytkownik je zobaczy, i zmniejszyć licznik unread na watchliście. Nieodłączne dla featurea (użytkownik zaakceptował ciche, twarde usuwanie); mitygacja = konfigurowalny limit.
- **Resurfacing sieroty w feedzie ogólnym.** News, który wypadł z top-N wszystkich swoich spółek, ale jest w top-N puli ogólnej, pojawi się na krótko w ogólnym feedzie bez tagu spółki (skutek świadomej decyzji „spada do puli ogólnej", potwierdzonej z użytkownikiem). Kosmetyczne, samokorygujące się.
- **Kaskada / kolejność.** Krok 1 (join rows) MUSI iść przed krokiem 2 (pula ogólna), inaczej sieroty nie zostaną uwzględnione w puli ogólnej. Usunięcie `news_items` polega na `ON DELETE CASCADE` + `foreign_keys = ON` — jeśli pragma kiedyś zniknie, zostaną osierocone `news_company`; pragma jest w `createDb()` (`src/db/index.ts:374`), nie zmieniać.
- **Ścieżka konfliktu/dedupu w `refreshNews()`.** Dopasowania są dopinane też przy konflikcie (`src/lib/news.ts:229-258`), więc zbiór „dotkniętych spółek" musi obejmować obie ścieżki, inaczej spółka rosnąca tylko przez re-match nie zostałaby przycięta. Zbieramy `companyId` niezależnie od tego, czy insert był nowy.
- **Wydajność podzapytań.** `ORDER BY ... LIMIT` w podzapytaniu per spółka jest tanie (mało wierszy/spółkę). Pełny przemiat przy starcie iteruje wszystkie spółki — akceptowalne w dashboardzie osobistym (dziesiątki spółek), ale gdyby lista bardzo urosła, ograniczyć do spółek mających newsy.
- **Współbieżność zapisu (WAL).** `refreshNews()` z crona i ręczny refresh mogą się nałożyć; scheduler ma `runGuarded()` przeciw nakładaniu crona (`src/lib/scheduler.ts:32-45`), a `busy_timeout=15000` (`src/db/index.ts:381`) kolejkuje zapisy. Owinięcie prune w transakcję dodatkowo zabezpiecza atomowość.
- **Zależności niezainstalowane w tym środowisku.** `node_modules/next/dist/docs/` nieobecne — implementator musi przeczytać przewodniki Next (instrumentation, route handlers) w środowisku z zależnościami przed edycją `scheduler.ts`/`instrumentation.ts`/route handlerów (reguła `AGENTS.md`).

## Pytania do doprecyzowania

Wszystkie otwarte pytania rozstrzygnięte z użytkownikiem (runda 2) — plan powyżej już odzwierciedla te decyzje:

- **Jeden wspólny limit czy dwa osobne?** → Jedna wspólna liczba `newsRetentionLimit` (domyślnie 20) dla obu pul.
- **Sierota: „spada do puli ogólnej" czy „usuwana od razu"?** → Spada do puli ogólnej.
- **Miejsce pola w UI.** → Nowa karta „Retencja newsów" w `/settings`, po „Źródła newsów (RSS)".
- **Konwergencja istniejących baz.** → Pełny przemiat raz przy starcie procesu (`startScheduler()`), natychmiastowa konwergencja.

Brak dalszych otwartych pytań.
