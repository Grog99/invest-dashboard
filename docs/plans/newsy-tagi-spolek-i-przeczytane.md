# Tagi spółek na newsach, „Ogólne", klik-tytuł = przeczytane, filtr „tylko moje spółki"

> Plan wygenerowany przez skill `/plan-feature`. Slug: `newsy-tagi-spolek-i-przeczytane`. Branch: `feature/newsy-tagi-spolek-i-przeczytane`.

## Kontekst / Problem

Zakładka Newsy (`src/app/news/page.tsx` → `NewsInfiniteList`) pokazuje wpisy z feedów RSS. Każdy `NewsListItem` ma już listę dopasowanych spółek (`companies: { id, ticker }[]`), a `NewsInfiniteList.tsx` renderuje je jako małe `Badge` w rzędzie z nazwą źródła i datą (linie ~123–131). Problemy zgłoszone przez użytkownika:

1. **Nie widać „na pierwszy rzut oka", jakiej spółki dotyczy news.** Trzeba albo filtrować po spółkach po kolei, albo czytać każdy (często niejasny) tytuł. Tagi tickerów istnieją, ale są małym, szarym tekstem, a newsy **bez** dopasowania nie mają żadnego oznaczenia — nie wiadomo, czy to news ogólny/rynkowy, czy po prostu niedopasowany.
2. **Klik w tytuł (link zewnętrzny) nie oznacza newsa jako przeczytany.** Trzeba osobno kliknąć przycisk ✓ obok tytułu, mimo że otwarcie artykułu = de facto przeczytanie.
3. **Lista zdominowana szumem.** Feed ESPI Bankiera zawiera komunikaty wszystkich spółek GPW, więc realnie ~96% wpisów nie dotyczy śledzonych spółek (lokalnie 5/126). Brakuje szybkiego sposobu pokazania „tylko newsów o moich spółkach".

Oczekiwany efekt: każdy news ma czytelny tag spółki lub jawny tag „Ogólne"; otwarcie artykułu z tytułu automatycznie oznacza go przeczytanym; jeden checkbox chowa cały szum bez dopasowania.

## Wymagania

- **Tag spółki widoczny na pierwszy rzut oka.** Istniejące tagi tickerów (`Badge tone="accent"`) mają być wizualnie wyraźniejsze niż dziś (większy i/lub bardziej kontrastowy `Badge`), pozostając w tym samym miejscu (pod tytułem, w rzędzie ze źródłem i datą). Treść tagu = **ticker** (nie pełna nazwa spółki).
- **Jawny tag „Ogólne".** Dla newsów bez dopasowanej spółki (`companies.length === 0`) renderować jawny `Badge` „Ogólne", analogiczny do tagów tickerów (nie klikalny — brak spółki do zlinkowania).
- **Klik w tytuł = przeczytane.** Klik w `<a>` z tytułem (link zewnętrzny) jako **efekt uboczny** oznacza news przeczytanym (zawsze `read=true`, nie toggle). Link nadal otwiera się normalnie (`target="_blank"`, `href`, domyślna nawigacja) — oznaczenie nie może blokować/opóźniać otwarcia. Jeśli news jest już przeczytany — no-op (bez zbędnego PATCH). **Dotyczy też kliku środkowym przyciskiem myszy** (otwarcie w tle, zdarzenie `auxclick`) — obsłużyć analogicznie, żeby otwarcie newsa w nowej karcie w tle też liczyło się jako przeczytane.
- **Istniejący przycisk ✓/↺ bez zmian.** Zostaje obok tytułu do ręcznego oznaczania/cofania bez otwierania linku.
- **Klik w tag spółki bez zmian.** Nadal linkuje do `/companies/[id]` (nie zamieniamy na filtr listy).
- **Filtr „tylko moje spółki".** Nowy checkbox w `NewsFilter.tsx` (obok „tylko nieprzeczytane") chowający newsy bez dopasowanej spółki (te z tagiem „Ogólne"). Działa analogicznie do `unread`: parametr URL → `page.tsx` → `listNews()` / `GET /api/news` → `NewsInfiniteList` (`loadMore()`), poprawnie współpracując z kursorem keyset i infinite scroll.
- **Niefunkcjonalne:** brak regresji paginacji keyset (kursor `(published_at, id)`), brak duplikacji wierszy przy filtrze „tylko moje spółki" (news dopasowany do kilku spółek nie może pojawić się wielokrotnie), brak nowego zapytania COUNT.

## Zakres i Non-goals

**W zakresie:**
- `src/components/ui.tsx` — opcjonalny, wstecznie zgodny wariant rozmiaru `Badge` (żeby ticker/„Ogólne" był wyraźniejszy).
- `src/components/NewsInfiniteList.tsx` — tag „Ogólne" dla `companies.length === 0`, powiększone/kontrastowe tagi, klik-tytuł → oznaczenie przeczytanym (fire-and-forget), propagacja nowego filtra do `loadMore()`.
- `src/components/NewsFilter.tsx` — drugi checkbox „tylko moje spółki" + przewleczenie nowego parametru URL.
- `src/lib/news.ts` — nowy `onlyMyCompanies?: boolean` w `listNews()` (warunek: news ma co najmniej jeden wpis w `news_company`), zgodny z istniejącym kursorem/`and(...)`.
- `src/app/news/page.tsx` — odczyt nowego `searchParams`, przekazanie do `listNews()` i `NewsInfiniteList`, uwzględnienie w `listKey`.
- `src/app/api/news/route.ts` — odczyt nowego parametru w `GET` i przekazanie do `listNews()`.

**Non-goals (świadomie pomijamy):**
- **Zamiana tagu spółki na filtr listy** — tag nadal linkuje do karty spółki (świadoma decyzja użytkownika).
- **Przeniesienie tagów nad tytuł** — zostają pod tytułem, w rzędzie ze źródłem/datą.
- **Pełna nazwa spółki w tagu** — zostaje ticker.
- **Zmiana przycisku ✓/↺** — pozostaje jak dziś (ręczny toggle).
- **Retroaktywny rematch newsów po dodaniu spółki/aliasu** (roadmapa 1.5) — osobny, niezrobiony temat, poza zakresem.
- **Zmiana logiki matchingu** (`matchCompanies`/`buildMatchers`) — fakt, że ~96% newsów jest „Ogólne", to naturalny efekt szerokiego feedu ESPI, nie bug.
- **Persist preferencji filtra w `settings`** — filtr żyje w URL jak `unread` (patrz Pytania nt. domyślnego stanu).

## Podejście

Zgodnie z regułą z `AGENTS.md` („to NIE jest Next.js, który znasz") zweryfikowano w `node_modules/next/dist/docs/`:
- `01-app/03-api-reference/03-file-conventions/page.md`: `searchParams` w Server Component to **`Promise`**, którą trzeba `await`ować (v15+); jest zwykłym obiektem JS (nie `URLSearchParams`); użycie jej opt-inuje stronę w dynamic rendering. Obecny `page.tsx` już to robi poprawnie (`searchParams: Promise<{...}>` + `await`). Rozszerzamy typ o nowy klucz.
- `01-app/01-getting-started/15-route-handlers.md`: Route Handlers nie są cache'owane domyślnie; czytanie `req.nextUrl.searchParams` czyni `GET` dynamicznym. Zgodne z istniejącym komentarzem w `route.ts` — **nie** dodajemy `export const dynamic`. Dodajemy tylko kolejny odczyt query-param w istniejącym `GET`.

Żadna z czterech zmian nie wymaga nowego API Next.js — reużywamy istniejących wzorców (filtr `unread`, kursor keyset, optimistic PATCH).

**1. Tag „Ogólne" + wyraźniejsze tagi.** W `NewsInfiniteList.tsx` w rzędzie meta (linie ~123–131) dokładamy warunek: gdy `n.companies.length === 0`, renderujemy statyczny `<Badge>Ogólne</Badge>` (bez `<Link>`), w przeciwnym razie mapujemy tickery jak dziś. Żeby tagi „wyskakiwały" z małego szarego tekstu źródła/daty, dodajemy do komponentu `Badge` (`src/components/ui.tsx`) **opcjonalny** prop `size?: "sm" | "md"` (default `"sm"` = dzisiejsze `text-[11px] px-1.5 py-0.5`, `"md"` ≈ `text-[12px] px-2 py-0.5`). Domyślka zachowuje 1:1 wygląd we wszystkich ~12 obecnych użyciach `Badge` (dashboard, karta spółki, watchlist, research, portfolio, SourcesManager) — zero regresji. Tagi na newsach renderujemy z `size="md"`. Tony: ticker = `accent` (jak dziś, kontrastowy niebieski), „Ogólne" = `neutral` (spokojny szary, wyraźnie „to nie konkretna spółka") — dokładny ton „Ogólne" do potwierdzenia w Pytaniach.

**2. Klik-tytuł = przeczytane (nieblokująco), także middle-click.** Refaktor lekki: wydzielamy z istniejącego `toggleRead` rdzeń `applyRead(item, nextRead)` (optimistic `setItems` + PATCH + `busyIds`). `toggleRead` woła `applyRead(item, !item.read)` (bez zmian zachowania). Do `<a>` tytułu dodajemy `onClick={() => { if (!n.read) void applyRead(n, true); }}` — **bez** `preventDefault`, więc link otwiera się normalnie w nowej karcie. Ponieważ `target="_blank"` nie niszczy bieżącej karty, fire-and-forget PATCH kończy się bez ryzyka anulowania; dodatkowo dla odporności dokładamy `keepalive: true` do tego `fetch` PATCH (tani bezpiecznik). Guard `if (!n.read)` eliminuje zbędny PATCH dla już przeczytanych. Środkowy klik (otwarcie w tle) nie odpala `onClick` w przeglądarce — dokładamy analogiczny `onAuxClick={(e) => { if (e.button === 1 && !n.read) void applyRead(n, true); }}` na tym samym `<a>` (React nazywa zdarzenie `auxClick`; `button === 1` to środkowy przycisk — prawy klik/context menu ma `button === 2` i nie powinien oznaczać przeczytane, więc guard jest wymagany). Pod aktywnym filtrem `unreadOnly` optimistic usunięcie wiersza po oznaczeniu przeczytanym jest zachowane przez `applyRead` (news znika z listy, jak dziś przy ✓) — spójne, bo link i tak otworzył się w osobnej karcie.

**3. Tag spółki bez zmian.** `<Link href={`/companies/${c.id}`}>` wokół tickerowego `Badge` zostaje.

**4. Filtr „tylko moje spółki".** Semantyka: „ma co najmniej jedno dopasowanie w `news_company`". Ponieważ `buildMatchers()` buduje matchery **wyłącznie** z tabeli `companies` (spółki użytkownika), każdy wiersz `news_company` wskazuje spółkę użytkownika — więc „ma wpis w `news_company`" == „dotyczy jednej z moich spółek" == „nie jest »Ogólne«". Nazwa filtra jest ścisła.

Implementacja analogiczna do `unreadOnly`:
- **URL param.** Proponowany `mine=1` (konwencja obecności jak `unread=1`; brak param = wyłączony). Nazwę param potwierdzić w Pytaniach.
- **`listNews()`** — nowy `onlyMyCompanies?: boolean`. W gałęzi **bez** `companyId` (`else`) dokładamy do `and(...)` warunek EXISTS zamiast joinu (join `news_company` zdublowałby wiersze i rozjechał `limit`):
  ```ts
  const hasMatchCondition = opts.onlyMyCompanies
    ? sql`exists (select 1 from ${newsCompany} where ${newsCompany.newsId} = ${newsItems.id})`
    : undefined;
  ```
  wstawiony obok `unreadOnly ? eq(newsItems.read, 0)` i `cursorCondition`. `news_company` ma PK `(newsId, companyId)`, więc EXISTS po `newsId` jest indeksowany — **żadnego nowego indeksu**. W gałęzi z `companyId` filtr jest redundantny (innerJoin już wymusza dopasowanie) — pomijamy go tam (lub przekazujemy no-op). Kursor keyset, sort i `nextCursor` bez zmian.
- **`GET /api/news`** — `const onlyMyCompanies = sp.get("mine") === "1";` i przekazanie do `listNews({...})`.
- **`page.tsx`** — `const onlyMyCompanies = sp.mine === "1";` → do `listNews()` i jako prop `NewsInfiniteList`; do `listKey` dochodzi segment `${onlyMyCompanies ? 1 : 0}`, żeby zmiana filtra remontowała listę (świeża pierwsza porcja, jak przy `unread`).
- **`NewsInfiniteList`** — nowy prop `onlyMyCompanies: boolean`; w `loadMore()` `if (onlyMyCompanies) params.set("mine", "1");` obok `unread`.
- **`NewsFilter`** — drugi checkbox „tylko moje spółki"; `navigate` rozszerzone o trzeci argument, każdy kontroler przekazuje bieżące wartości pozostałych.

Odrzucona alternatywa: `innerJoin news_company` w gałęzi `else` (prostsze w zapisie, ale duplikuje newsy dopasowane do wielu spółek → psuje `limit`/kursor); EXISTS jest poprawne i tanie.

## Pliki do zmiany

- `src/components/ui.tsx` — do `Badge` dodać opcjonalny `size?: "sm" | "md"` (default `"sm"`). Mapa rozmiarów obok istniejącej mapy `tones` (`sm`: `text-[11px] px-1.5 py-0.5` = dzisiejsze; `md`: `text-[12px] px-2 py-0.5`). Nie zmieniać sygnatury `tone` ani domyślnego wyglądu (wsteczna zgodność z ~12 użyciami — patrz grep `<Badge`).
- `src/components/NewsInfiniteList.tsx` — (a) w rzędzie meta: `n.companies.length === 0 ? <Badge size="md" tone="neutral">Ogólne</Badge> : n.companies.map(... <Badge size="md" tone="accent">{c.ticker}</Badge> ...)`; (b) wydzielić `applyRead(item, nextRead)` z `toggleRead` i wołać `toggleRead → applyRead(item, !item.read)`; (c) do `<a>` tytułu dodać `onClick` markujący przeczytane (`if (!n.read) void applyRead(n, true)`), bez `preventDefault`, **oraz** `onAuxClick` z guardem `e.button === 1` dla środkowego kliku; dodać `keepalive: true` do PATCH; (d) nowy prop `onlyMyCompanies`, przekazany do `params.set("mine","1")` w `loadMore()`. Reużyj: `Badge`/`Link`/`fmtDateTime`, istniejący optimistic-PATCH.
- `src/components/NewsFilter.tsx` — drugi `<label><input type="checkbox">` „tylko moje spółki"; `const mine = params.get("mine") === "1"`; `navigate(nextCompany, nextUnread, nextMine)` z `if (nextMine) q.set("mine","1")`; każdy `onChange` przekazuje aktualne pozostałe wartości. Reużyj: wzorzec `unread` w tym pliku (`useSearchParams` + `router.push`).
- `src/lib/news.ts` — do `listNews(opts)` dodać `onlyMyCompanies?: boolean`; w gałęzi `else` dołożyć warunek `exists(...)` do `and(...)` (patrz Podejście). Reużyj: `newsCompany` (już importowany), `sql`, istniejąca struktura dwóch zapytań + `cursorCondition`. Gałąź `companyId` bez zmian.
- `src/app/api/news/route.ts` — w `GET`: `const onlyMyCompanies = sp.get("mine") === "1";`, przekazać do `listNews({ companyId, unreadOnly, onlyMyCompanies, limit, cursor })`. `PATCH`/`DELETE` bez zmian. Reużyj: `listNews`, `encodeCursor`/`decodeCursor`.
- `src/app/news/page.tsx` — rozszerzyć typ `searchParams` o `mine?: string`; `const onlyMyCompanies = sp.mine === "1";`; przekazać do `listNews(...)`, do `<NewsInfiniteList onlyMyCompanies={onlyMyCompanies} .../>` i do `listKey` (`...-${onlyMyCompanies ? 1 : 0}-...`). Reużyj: istniejący wzorzec `unreadOnly`.

## Kryteria akceptacji

- [ ] Każdy news na `/news` ma widoczny tag: tickerowy `Badge` (klikalny → `/companies/[id]`) dla dopasowanych lub `Badge` „Ogólne" (nieklikalny) dla `companies.length === 0`.
- [ ] Tagi są wyraźnie czytelniejsze niż mały szary tekst źródła/daty (większy/kontrastowy `Badge`); pozostałe użycia `Badge` w aplikacji wyglądają jak przed zmianą.
- [ ] Klik w tytuł newa (lewy przycisk) otwiera artykuł w nowej karcie **i** oznacza news przeczytanym (tytuł przechodzi w stan „przeczytany" bez odświeżania strony); klik nie jest opóźniany/blokowany. Dla już przeczytanego newsa klik nie wysyła zbędnego PATCH.
- [ ] Klik środkowym przyciskiem myszy w tytuł (otwarcie w tle) też oznacza news przeczytanym; prawy klik (menu kontekstowe) nie oznacza.
- [ ] Przycisk ✓/↺ obok tytułu działa jak dotąd (ręczny toggle w obie strony).
- [ ] Zaznaczenie „tylko moje spółki" chowa wszystkie newsy z tagiem „Ogólne"; odznaczenie przywraca je. Działa dla pierwszej porcji (server-side) **i** dla doładowań przez infinite scroll.
- [ ] Filtr „tylko moje spółki" nie duplikuje newsów dopasowanych do wielu spółek i nie psuje kursora/`limitu` (brak przeskoków/duplikatów przy scrollu).
- [ ] Filtry `company`, `unread`, `mine` są niezależnie kombinowalne w URL, a zmiana każdego resetuje listę do świeżej pierwszej porcji.
- [ ] `GET /api/news?mine=1&cursor=…` respektuje `company`/`unread`/`mine` i zwraca spójne `{ items, nextCursor }`.
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się i wszystkie cztery zmiany działają w preview.

## Ryzyka

- **Parytet z kursorem keyset.** Warunek `exists(...)` musi wejść do tego samego `and(...)` co `cursorCondition` i `unreadOnly`, inaczej filtr rozjedzie się z paginacją (pominięte/zdublowane wiersze na granicy stron). Sort i `nextCursor` zostają bez zmian — filtr tylko zawęża zbiór, nie zmienia porządku.
- **Duplikacja przy joinie.** Kuszące `innerJoin news_company` w gałęzi `else` zdublowałoby newsy wielospółkowe i rozbiło `limit`. Trzymać się EXISTS (subquery), nie joinu.
- **Fire-and-forget PATCH przy kliku w tytuł.** Polega na `target="_blank"` (bieżąca karta żyje). Dodatkowo `keepalive: true` zabezpiecza na wypadek, gdyby ktoś w przyszłości zmienił link na nawigację w tej samej karcie. Guard `if (!n.read)` chroni przed duplikatem PATCH.
- **Middle-click / otwarcie w tle.** `onClick` nie odpala się przy kliknięciu środkowym przyciskiem (to `auxclick`) — obsługujemy to osobnym handlerem `onAuxClick` z guardem `e.button === 1`, żeby nie złapać przy okazji prawego kliku (`button === 2`, menu kontekstowe).
- **Interakcja z `unreadOnly`.** Pod aktywnym „tylko nieprzeczytane" klik w tytuł usuwa wiersz z listy (optimistic, jak ✓) — pożądane, ale warto zweryfikować w preview, że nie „miga" przed otwarciem karty.
- **Domyślny stan nowego filtra.** Domyślne WŁĄCZENIE przy 5/126 dopasowaniach sprawi, że strona wyląduje niemal pusta i ukryje feed ESPI, który użytkownik świadomie skonfigurował — patrz Pytania.
- **Spójność `Badge` w całej aplikacji.** Prop `size` musi być opcjonalny z domyślką = dzisiejszy wygląd; zweryfikować wizualnie dashboard/karta spółki/watchlist/research/portfolio, że nic się nie przesunęło.
- **`listKey` w `page.tsx`.** Pominięcie `onlyMyCompanies` w `listKey` sprawi, że przełączenie filtra nie zremontuje listy i doklejone strony zostaną ze starego zbioru — pamiętać o dołożeniu segmentu.

## Pytania do doprecyzowania

Wszystkie decyzje potwierdzone z użytkownikiem:

- **Domyślny stan filtra „tylko moje spółki"**: WYŁĄCZONY (unchecked) — spójne z konwencją `unread` (param-obecność = on).
- **Ton `Badge` „Ogólne"**: `neutral` (szary). Ticker zostaje `accent`.
- **Nazwa parametru URL**: `mine` (`?mine=1`).
- **Checkbox „tylko moje spółki" przy wybranej konkretnej spółce**: zostaje aktywny, no-op (bez dodatkowej logiki ukrywania).
- **Middle-click na tytule**: **obsłużyć** — otwarcie w tle środkowym przyciskiem też oznacza news przeczytanym (`onAuxClick`, guard `e.button === 1`), patrz sekcja Podejście pkt 2 i Pliki do zmiany.
