# Paginacja / infinite scroll newsów

> Plan wygenerowany przez skill `/plan-feature`. Slug: `paginacja-newsow`. Branch: `feature/paginacja-newsow`.

## Kontekst / Problem

Strona `src/app/news/page.tsx` (Server Component) woła `listNews({ companyId, unreadOnly, limit: 150 })` i renderuje statyczną listę pierwszych 150 newsów — reszta historii jest niedostępna z UI. Po włączeniu harmonogramu odświeżania (punkt 3.1 roadmapy — node-cron w `instrumentation.ts`, już zmergowany) baza newsów będzie szybko rosła, więc twardy limit 150 realnie ukrywa większość danych. Chcemy dostęp do pełnej historii bez czyszczenia bazy.

Rozwiązanie: automatyczny infinite scroll na `/news` — pierwsza porcja renderowana server-side jak dziś, kolejne doklejane klienckim komponentem przez nowy endpoint `GET /api/news`. Kluczowa trudność: harmonogram wstawia nowe newsy w tle **podczas** przewijania — paginacja musi być stabilna (bez przesunięć, duplikatów ani pominięć). Stąd kursor keyset oparty o `(published_at, id)`, a nie `LIMIT/OFFSET`.

## Wymagania

- Na `/news` ładuje się 50 newsów server-side (dziś 150); przewinięcie do dołu automatycznie doładowuje kolejne 50 (IntersectionObserver na sentinelu, **bez** przycisku „Załaduj więcej").
- Paginacja stabilna przy równoległych insertach: newsy dodane w tle (nowsze niż to, co użytkownik już przewinął) **nie** przesuwają załadowanych stron ani nie powodują duplikatów/pominięć podczas scrollowania. Realizowane kursorem keyset `(published_at, id)` z warunkiem `< kursor` i sortowaniem `ORDER BY published_at DESC, id DESC`.
- Poprawna obsługa `published_at = NULL` (część wpisów RSS nie ma daty — `toIso()` zwraca `null`): NULL-e trafiają na koniec listy (jak dziś) i **muszą** być stronicowalne (nie mogą wypaść z paginacji).
- Nowy endpoint `GET /api/news` zwraca kolejną porcję JSON zgodną z `NewsListItem`, respektując filtry `company` i `unread`.
- Zmiana filtra (spółka / tylko nieprzeczytane) resetuje infinite scroll do pierwszej porcji (świeży request od zera, nie doklejanie do starej listy).
- Zachowane dotychczasowe działanie: oznaczanie przeczytany/nieprzeczytany per news, „Oznacz wszystkie jako przeczytane", odświeżanie newsów, badge'y spółek linkujące do kart.
- Niefunkcjonalne: brak regresji wydajności zapytania listy przy rosnącej bazie (kursor + indeks złożony).

## Zakres i Non-goals

**W zakresie:**
- `src/lib/news.ts` — parametr kursora w `listNews()` (keyset na `(published_at, id)` z obsługą NULL) + stabilny tiebreak w sortowaniu wynikowym.
- `src/db/index.ts` — indeks złożony pod kursor.
- `src/app/api/news/route.ts` — nowy handler `GET` (obok istniejących `PATCH`/`DELETE`).
- `src/app/news/page.tsx` — pierwsza porcja 50 server-side + osadzenie nowego klienckiego komponentu listy.
- Nowy `src/components/NewsInfiniteList.tsx` — kliencki infinite scroll z IntersectionObserver, przejmuje renderowanie wierszy (dziś w `<ul>` w page.tsx).
- Helper enkodowania/dekodowania kursora (mały, w `src/lib/news.ts`).

**Non-goals (świadomie pomijamy):**
- Dashboard `src/app/page.tsx` (`limit: 8`) i karta spółki `src/app/companies/[id]/page.tsx` (`limit: 15`) — celowe krótkie podglądy, **bez zmian**.
- Przycisk „Załaduj więcej" (decyzja: tylko automatyczny scroll).
- `LIMIT/OFFSET` jako mechanizm paginacji (odrzucone — niestabilne przy insertach w tle).
- Wirtualizacja listy / recykling DOM-u (przy porcjach po 50 zbędne; ewentualnie później).
- Zmiany w `MarkAllReadButton` jako logice globalnej PATCH (działa na całej bazie) — patrz jednak Pytania (interakcja z lokalnym stanem listy).

## Podejście

Zgodnie z regułą z `AGENTS.md` („to NIE jest Next.js, który znasz") zweryfikowano w `node_modules/next/dist/docs/`:
- `01-app/01-getting-started/15-route-handlers.md`: Route Handlers definiuje się przez eksport metody (`export async function GET(request: Request)`) w `route.ts`; **nie są cache'owane domyślnie**; sięgnięcie po `req.url` / query params czyni handler dynamicznym (nie prerenderuje się). `next.config.ts` **nie** ma włączonego Cache Components/`cacheComponents`, więc nie trzeba dodawać `export const dynamic`. Można czytać query przez `req.nextUrl.searchParams` (handler już importuje `NextRequest`).
- Strony pozostają Server Components z `export const dynamic = "force-dynamic"` (wzorzec projektu, `context/decisions.md`); mutacje przez API route + `router.refresh()` — ten sam wzorzec rozszerzamy o odczytowy `GET` dla doładowań.

**Kształt kursora (keyset).** Sortowanie: `ORDER BY coalesce(published_at, '') DESC, id DESC`. Coalesce do `''` **dokładnie** odwzorowuje dzisiejsze zachowanie sortowania w JS (`(publishedAt ?? "").localeCompare(...)` — NULL → `""` → na koniec przy malejącym), a `id DESC` daje unikalny, stabilny tiebreak (bo `id` to autoincrement PK). Para `(coalesce(published_at,''), id)` jest ścisłym porządkiem totalnym → brak duplikatów i pominięć.

Kursor = ostatni element zwróconej porcji: `{ publishedAt: string | null, id: number }`. Warunek „starsze niż kursor" (malejąco):
```sql
WHERE (coalesce(published_at,''), id) < (:cursorKey, :cursorId)   -- :cursorKey = cursor.publishedAt ?? ""
```
SQLite wspiera porównania row-value od 3.15 (better-sqlite3 ma nowszy SQLite). W Drizzle budujemy to przez `sql` tagged template. Wariant zapasowy (gdyby row-value sprawiało problem): `coalesce(published_at,'') < :k OR (coalesce(published_at,'') = :k AND id < :cid)`.

Dlaczego coalesce, a nie surowe kolumny: przy surowym `(published_at, id) < (:pub, :id)` wiersze z `published_at = NULL` dają w porównaniu NULL → są wykluczane z WHERE i **nigdy** nie zostałyby dostronicowane (spadłyby z listy). Coalesce eliminuje ten błąd i utrzymuje parytet z istniejącym sortem JS.

**Enkodowanie na drut.** Pojedynczy, nieprzezroczysty param `cursor` = base64url(JSON `{ p: publishedAt|null, i: id }`). Małe helpery `encodeCursor`/`decodeCursor` w `src/lib/news.ts` (reużywane przez page.tsx do policzenia `initialCursor` i przez route do dekodowania). Dwa osobne query-paramy to alternatywa — wybieramy jeden param dla prostoty przewlekania.

**Wyliczanie `nextCursor`.** `listNews()` nadal zwraca `NewsListItem[]` (zawiera już `id` i `publishedAt`), więc sygnatura zwrotu bez zmian. Wołający liczy: `hasMore = items.length === limit`; `nextCursor = hasMore ? encodeCursor(last) : null`. (Kompromis: gdy pozostało dokładnie `limit` wpisów, ostatni fetch zwróci `[]` z `nextCursor=null` — jeden pusty request na końcu; akceptowalne przy S.)

**Uwaga o dzisiejszym `.sort()` w `listNews()` — NIE jest redundantny.** `listNews()` robi dwa zapytania: (1) `baseIds` z `ORDER BY published_at DESC LIMIT`, potem (2) pełne wiersze przez `inArray(id, baseIds)` **bez ORDER BY** — drugie zapytanie gubi kolejność, więc końcowy `.sort()` ją odtwarza. Zostawiamy go, ale **dodajemy tiebreak po `id` malejąco**, żeby porządek JS był identyczny z porządkiem keyset w SQL (inaczej „ostatni element" = kursor mógłby nie zgadzać się z tym, co SQL uzna za następne). Nowy komparator: `(b.publishedAt ?? "").localeCompare(a.publishedAt ?? "") || (b.id - a.id)`.

**Kliencki infinite scroll.** Nowy `NewsInfiniteList.tsx` (`"use client"`) trzyma stan `items/cursor/loading/done/error`, seedowany z propsów server-side. `useRef` na sentinel div na dole + `IntersectionObserver` w `useEffect`; przy wejściu sentinela w widok (i gdy `!loading && !done`) fetchuje `GET /api/news?cursor=…&company=…&unread=…&limit=50`, dokleja `items`, aktualizuje `cursor`, ustawia `done` gdy `nextCursor === null`. Renderuje te same `<li>` co dziś (przeniesione z page.tsx), z `NewsReadToggle`, `Badge`, `fmtDateTime`, `Link`. Reset przy zmianie filtra: w page.tsx nadajemy `key={`${companyId ?? "all"}-${unreadOnly ? 1 : 0}`}` na komponencie → zmiana filtra (NewsFilter robi `router.push`, re-render server) remountuje listę ze świeżym stanem. Wzorce klienckie do reużycia: `useRef/useState/useEffect` + `fetch` jak w `src/components/AiChat.tsx`; PATCH + optimistic update jak w `src/components/NewsActions.tsx`.

## Pliki do zmiany

- `src/lib/news.ts` — do `listNews(opts)` dodać `cursor?: { publishedAt: string | null; id: number }`. W obu gałęziach (z `companyId` przez join i bez) dołożyć warunek keyset do `and(...)` oraz zmienić `orderBy` na `coalesce(published_at,'') DESC, id DESC` (przez `sql`). Rozszerzyć końcowy `.sort()` o tiebreak `|| (b.id - a.id)`. Dodać eksportowane `encodeCursor(item)` / `decodeCursor(str)` (base64url JSON). Reużyj istniejącej struktury dwóch zapytań + `matchesByNews`/`sources`.
- `src/db/index.ts` — w `BOOTSTRAP_SQL` dodać `CREATE INDEX IF NOT EXISTS idx_news_published_id ON news_items(coalesce(published_at,'') DESC, id DESC);` (indeks wyrażeniowy zgodny z ORDER BY/WHERE kursora — utrzymuje keyset szybki przy rosnącej bazie; idempotentny, spójny z resztą `... IF NOT EXISTS` w bootstrapie). Nie ruszać zbramkowanej `migrateNewsDedup()`.
- `src/app/api/news/route.ts` — dodać `export async function GET(req: NextRequest)`: czytać `req.nextUrl.searchParams` (`cursor` base64, `company`, `unread`, `limit`), zclampować `limit` (np. 1..100, default 50), zdekodować kursor, wołać `listNews({ companyId, unreadOnly, limit, cursor })`, zwrócić `NextResponse.json({ items, nextCursor })` gdzie `nextCursor = items.length === limit ? encodeCursor(items.at(-1)) : null`. `PATCH`/`DELETE` bez zmian. Reużyj: `listNews`, `encodeCursor` z `@/lib/news`.
- `src/app/news/page.tsx` — zmienić `limit: 150` → `limit: 50`; policzyć `initialCursor = news.length === 50 ? encodeCursor(news.at(-1)) : null`. Zamiast statycznego `<ul>` renderować `<NewsInfiniteList initialItems={news} initialCursor={initialCursor} companyId={companyId} unreadOnly={unreadOnly} key={…} />` wewnątrz `<Card>`. `EmptyState` dla `news.length === 0` zostaje server-side. Reużyj: `Card`, `EmptyState`, `RefreshNewsButton`.
- `src/components/NewsInfiniteList.tsx` (NOWY, `"use client"`) — stan + IntersectionObserver + fetch + render wierszy (przeniesione z page.tsx). Reużyj: `NewsReadToggle` (`@/components/NewsActions`), `Badge` (`@/components/ui`), `fmtDateTime` (`@/lib/format`), `Link` (`next/link`), typ `NewsListItem` (`@/lib/news`). Loader/spinner na dole (nowy, mały) + komunikat błędu z retry — patrz Pytania.

## Kryteria akceptacji

- [ ] `/news` renderuje 50 newsów przy wejściu (server-side w HTML), przewinięcie do dołu automatycznie dokłada kolejne 50 bez klikania.
- [ ] Doładowanie kolejnej strony podczas gdy w tle dojdą nowe newsy (np. ręczne „Pobierz newsy" w innej karcie) **nie** duplikuje ani nie pomija wierszy na już przewiniętej liście.
- [ ] Newsy bez `published_at` są osiągalne przez scroll (pojawiają się na końcu, nie wypadają z paginacji).
- [ ] Zmiana filtra spółki / „tylko nieprzeczytane" resetuje listę do pierwszej porcji (brak doklejania do poprzedniego zestawu).
- [ ] `GET /api/news?limit=50&cursor=…` zwraca `{ items, nextCursor }`; `nextCursor === null` na końcu historii; respektuje `company` i `unread`.
- [ ] Oznaczanie przeczytany/nieprzeczytany działa również na doładowanych (nie tylko pierwszych) wierszach.
- [ ] Dashboard i karta spółki niezmienione (nadal 8 / 15 pozycji).
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się i infinite scroll działa w preview.

## Ryzyka

- **Row-value comparison w SQLite/Drizzle.** Trzeba zbudować `(expr, id) < (?, ?)` przez `sql` template; jeśli sprawi kłopot — użyć rozwinięcia OR (patrz Podejście). Zweryfikować, że planner używa `idx_news_published_id` (`EXPLAIN QUERY PLAN`).
- **Parytet sortowania JS ↔ SQL.** Kursor liczony z ostatniego elementu tablicy po `.sort()` w JS — komparator JS musi być identyczny z `ORDER BY` w SQL (coalesce do `""` + tiebreak `id` malejąco). Rozjazd = pominięte/zdublowane wiersze na granicy stron.
- **Interakcja read-toggle z doklejonym stanem.** Dzisiejszy `NewsReadToggle` robi `router.refresh()`, co re-renderuje tylko server-side pierwszą porcję; kliencki stan doklejonych stron by się rozjechał. Rekomendacja: lista trzyma `items` w stanie i toggluje `read` lokalnie (PATCH + optimistic update; przy `unreadOnly` usuwa wiersz po oznaczeniu przeczytanym — jak dziś robi to re-render). Patrz Pytania (dot. też `MarkAllReadButton`).
- **Indeks wyrażeniowy w bootstrapie.** `CREATE INDEX IF NOT EXISTS` na wyrażeniu `coalesce(...)` odpala się w każdym worker-procesie `next build` — spójne z istniejącymi `... IF NOT EXISTS` (bufor `busy_timeout=15000` już ustawiony), ale zweryfikować brak `SQLITE_BUSY` przy buildzie (znany wcześniej problem — patrz komentarz przy `needsNewsDedupMigration`).
- **Podwójny/zbyt szybki fetch.** IntersectionObserver może wystrzelić wielokrotnie — guard `loading`/`done` + rozłączanie observera po `done`, żeby nie robić równoległych requestów tej samej porcji.
- **Nakład zgodny z S** — pilnować, by nie rozrósł się o wirtualizację, licznik globalny (COUNT) czy prefetch wielu stron naraz, jeśli nie wyniknie to z odpowiedzi na Pytania.

## Decyzje z rundy doprecyzowania

- **UX loadera:** mały spinner/„Ładowanie…" podczas fetchu kolejnej porcji **oraz** wyraźny, wyszarzony komunikat „Koniec historii" gdy `nextCursor === null`.
- **Błąd sieci przy doładowaniu:** widoczny wiersz błędu pod listą („Nie udało się załadować") z przyciskiem „Ponów" — jawny retry, bez cichego automatycznego ponawiania.
- **`MarkAllReadButton`:** po kliknięciu „Oznacz wszystkie jako przeczytane" cała lista (łącznie z już doklejonymi stronami) resetuje się i ładuje od nowa pierwszą porcję ze świeżym stanem `read` — najprostsze rozwiązanie, spójne z dzisiejszym `router.refresh()`. Można to zrealizować tym samym mechanizmem `key` co reset przy zmianie filtra (`NewsInfiniteList` remountuje się po odświeżeniu strony).
- **Licznik „załadowano X (z Y)":** pomijamy `Y` (globalny COUNT) — nie dokładamy dodatkowego zapytania. Jeśli potrzebny prosty licznik „załadowano X", to tylko długość tablicy w stanie klienta (opcjonalne, nie blokuje kryteriów akceptacji).
- **`rootMargin` / próg prefetchu obserwatora:** `rootMargin: "200px"` (odpalenie fetchu, zanim sentinel realnie wejdzie w viewport, dla płynniejszego scrolla) — decyzja implementacyjna, nie wymaga dalszej konsultacji.

## Pytania do doprecyzowania

*(brak otwartych pytań — wszystkie rozstrzygnięte powyżej)*
