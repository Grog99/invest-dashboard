# Kolor spółki

> Plan wygenerowany przez skill `/plan-feature`. Slug: `kolor-spolki`. Branch: `feature/kolor-spolki`.

## Kontekst / Problem

System ikonek spółek (`docs/plans/ikonki-spolek.md`) potrafi już pobierać realne logo, a gdy go brak — renderuje awatar z inicjałami na kolorze z deterministycznego hasha tickera (`src/components/CompanyLogo.tsx`). Hash daje kolor „jakikolwiek", niezwiązany z identyfikacją spółki przez użytkownika. Chcemy pozwolić użytkownikowi przypisać spółce **własny kolor** przy dodawaniu/edycji i używać go spójnie w trzech miejscach UI:

- **Dashboard → Alokacja** (donut + legenda) — wycinek spółki w jej kolorze.
- **Portfel i watchlista** — kolor jako tło awatara-fallbacku, gdy nie ma pobranego logo.
- **Newsy** — kolor jako wypełnione tło badge'a spółki.

Efekt: spójna, rozpoznawalna „tożsamość kolorystyczna" spółki w całej aplikacji, przy zachowaniu dotychczasowego zachowania dla spółek bez ustawionego koloru.

## Wymagania

- Formularz dodawania/edycji spółki (`CompanyForm`) pozwala wybrać kolor: **preset z palety kategorycznej** (`--color-cat-1..8` + `--color-cat-other`) **lub własny hex** (`<input type="color">` + pole hex). Presety to domyślna, wygodna ścieżka; hex — opcja dla nietypowych spółek. Musi być też opcja „brak koloru" (fallback jak dziś).
- Kolor przechowywany w jednej nullowalnej kolumnie `companies.color TEXT`.
- **Alokacja**: kolor spółki nadpisuje kolor wycinka **tylko gdy ustawiony**; spółki bez koloru zachowują dotychczasowy kolor slotu z palety (`PALETTE[i]`). „Inne" zostaje szare.
- **Badge w newsach**: wypełnione tło — własny kolor gdy ustawiony, inaczej deterministyczny kolor z hasha tickera (ten sam mechanizm co awatar). Tekst kontrastowy.
- **Awatar (`CompanyLogo`)**: kolor działa **wszędzie**, gdzie renderowany jest awatar-fallback (portfel, watchlista, dashboard, nagłówek spółki, karty mobilne). Gdy realne logo JEST pobrane — koloru NIE używamy.
- Niefunkcjonalne: brak hydration mismatch (strony/donut są `force-dynamic`, część renderuje się na serwerze); wartości koloru muszą być deterministyczne (bez `getComputedStyle`). Responsywność mobilna ~360–390px dla pola koloru i badge'y (reguła z `AGENTS.md`).

## Zakres i Non-goals

**W zakresie:**
- Kolumna `companies.color` + idempotentna migracja wg wzorca `migrateCompanyDomain`.
- Wspólny util `src/lib/companyColor.ts` — jedno źródło prawdy dla: formatu koloru, resolvera tło/tekst, oraz deterministycznego `hash→token` (wyniesienie `hashString`/`AVATAR_PALETTE` z `CompanyLogo`).
- Pole wyboru koloru w `CompanyForm` (presety + hex + „brak").
- Walidacja/normalizacja `color` w `POST /api/companies` i `PATCH /api/companies/[id]`.
- Użycie koloru w `CompanyLogo`, `AllocationDonut` (+ `page.tsx` mapowanie), badge newsów (`NewsInfiniteList` **oraz** karta newsów na dashboardzie w `page.tsx`), z przeniesieniem `color` przez `listNews` (`src/lib/news.ts`).
- Rozszerzenie `Badge` (`src/components/ui.tsx`) o wypełnione tło inline.

**Non-goals (świadomie pomijamy):**
- Kolor dla pozycji CFD (osobny byt, brak awatara/alokacji per-spółka).
- Kolorowanie innych wykresów (AreaChart, historia) — tylko donut alokacji.
- Migracja/backfill kolorów dla istniejących spółek (kolumna nullowalna, brak = dotychczasowe zachowanie).
- Rozszerzanie palety kategorycznej ani zmiana tokenów w `globals.css`.
- Paleta „per-motyw" dla hexa — hex jest stały w obu motywach z założenia (kontrast liczony z luminancji).

## Podejście

### 1. Format przechowywania koloru (rdzeń featurea)

Jedna kolumna `companies.color TEXT` nullable, przechowująca **dyskryminowaną wartość tekstową**:

- **Preset** → zapis tokenu: `cat-1` … `cat-8`, `cat-other` (regex `^cat-([1-8]|other)$`).
- **Własny** → zapis znormalizowanego hexa: `#rrggbb` (lowercase, 6 cyfr).
- **Brak** → `NULL`.

Uzasadnienie: token zachowuje **theme-awareness** presetów — resolver zamienia `cat-3` → `var(--color-cat-3)`, więc kolor adaptuje się do motywu light/dark przez kaskadę CSS (dokładnie jak dziś donut/awatar), a token tekstu to `var(--color-cat-ink)` (już odwracany między motywami). Surowy hex jest z definicji stały (nie adaptuje się), więc dla niego kontrast tekstu liczymy z luminancji → ciemny/jasny atrament. Zapis „gołego" `var(...)` w DB odrzucamy — token jest krótszy, walidowalny zamkniętym zbiorem i nie wiąże danych z nazwami zmiennych CSS. Zapis rozłożonego RGB też odrzucamy — hex jest natywnym formatem `<input type="color">`.

### 2. Wspólny util `src/lib/companyColor.ts` (jedno źródło prawdy)

Framework-agnostyczny moduł (bez `server-only`, importowalny w Server Components i `"use client"`). Proponowane API:

- `CAT_TOKENS` — `["cat-1"…"cat-8","cat-other"]` (lista presetów do formularza).
- `AVATAR_TOKENS` — `["cat-1"…"cat-8"]` (bez „other"; pula fallbacku hasha, parytet z dzisiejszym `AVATAR_PALETTE`).
- `hashString(s)` i `hashToken(ticker): "cat-N"` — **przeniesione z `CompanyLogo`**; `hashToken = AVATAR_TOKENS[hashString(ticker.toUpperCase()) % AVATAR_TOKENS.length]`.
- `normalizeColor(input): { ok: boolean; value: string | null }` — trim+lowercase; `""`/`null` → `{ok:true, value:null}`; token → jw.; `#rrggbb` lub `rrggbb` → `#rrggbb`; inaczej `{ok:false}`. Reużyte przez POST i PATCH.
- `resolveColorBackground(color): string | null` — token → `var(--color-${token})` (np. `var(--color-cat-3)`); hex → hex; `null`/nieprawidłowy → `null`. **Do `style.background`.**
- `resolveColorInk(color): string | null` — token → `var(--color-cat-ink)`; hex → obliczony atrament (YIQ/luminancja: jasne tło → `#1c1712`, ciemne → `#fbf5e9`); `null` → `null`. **Do `style.color`.**
- Wygodne (awatar/badge, z fallbackiem na hash): `avatarBackground(color, ticker) = resolveColorBackground(color) ?? \`var(--color-${hashToken(ticker)})\`` oraz `avatarInk(color, ticker) = resolveColorInk(color) ?? "var(--color-cat-ink)"`.

Wszystkie zwracane wartości są deterministyczne i identyczne na SSR i kliencie: albo `var(--color-cat-N)` / `var(--color-cat-ink)` (sama nazwa zmiennej, podstawiana przez kaskadę na `<html data-theme>`), albo stały hex — brak `getComputedStyle`. To spełnia ostrzeżenie z komentarza w `AllocationDonut.tsx` (linie 3–23).

**Rozgraniczenie użycia (per powierzchnia):**
- `CompanyLogo` (awatar-fallback) i badge newsów → `avatarBackground`/`avatarInk` (color **lub** hash).
- `AllocationDonut` → `resolveColorBackground(color) ?? PALETTE[i]` (color **lub** slot palety, **nie** hash), „Inne" → szary. Dlatego util udostępnia zarówno warstwę „niską" (`resolveColorBackground` zwracający `null`), jak i „wygodną".

### 3. Next.js — potwierdzenie API (reguła `AGENTS.md`)

Przeczytane `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`: Route Handlery `POST`/`PATCH` **nie są cache'owane** — rozszerzamy istniejące handlery (`src/app/api/companies/route.ts`, `.../[id]/route.ts`), bez nowego API Next.js ani `export const dynamic`. Formularz używa klienckiego `fetch` (jak dziś `CompanyForm`), **nie** Server Actions. `<input type="color">` to natywny element HTML (zawsze zwraca `#rrggbb`) — poza zakresem specyfiki Next.js. Strony pozostają `force-dynamic`.

## Pliki do zmiany

- `src/db/schema.ts` — dodać `color: text("color")` do `companies` (nullable, po `domain`). Typ `Company` (`$inferSelect`) automatycznie zyska `color: string | null`.
- `src/db/index.ts` — (a) dodać `color TEXT` do `companies` w `BOOTSTRAP_SQL`; (b) dodać `needsCompanyColorMigration()` + `migrateCompanyColor()` jako **dokładną kalkę** `needsCompanyDomainMigration`/`migrateCompanyDomain` (read-only guard `PRAGMA table_info` → transakcja z re-checkiem → `ALTER TABLE companies ADD COLUMN color TEXT`); (c) wywołać `migrateCompanyColor(sqlite)` w `createDb()` po `migrateCompanyDomain(sqlite)`.
- `src/lib/companyColor.ts` — **NOWY** util wg sekcji „Podejście 2".
- `src/components/CompanyLogo.tsx` — dodać prop `color?: string | null`; usunąć lokalne `hashString`/`AVATAR_PALETTE`, importować z utila; w gałęzi fallbacku użyć `avatarBackground(color, ticker)` / `avatarInk(color, ticker)` zamiast dzisiejszego `AVATAR_PALETTE[...]` + `var(--color-cat-ink)`. Reużyj: `src/lib/companyColor.ts`.
- `src/components/CompanyForm.tsx` — dodać stan `color` (init `company?.color ?? null`), dołożyć do `payload`; UI: rząd swatchy presetów (iteracja `CAT_TOKENS` — **9 pozycji: `cat-1..8` + `cat-other`**, decyzja: `cat-other` jest wybieralnym presetem; tło `var(--color-${t})`, zaznaczenie aktywnego), `<input type="color">` + pole hex dla własnego, oraz przycisk „Brak/Wyczyść" (→ `null`). Reużyj: `Label` z `src/components/ui.tsx`, `CAT_TOKENS`/`normalizeColor` z utila. Responsywność: swatche `flex-wrap`, kontrolki układają się w pionie < ~390px.
- `src/app/api/companies/route.ts` (POST) — odczytać `body.color`, `normalizeColor(...)`; przy `!ok` zwrócić **`400`** (decyzja: parytet ze „surową walidacją" z ostatnich commitów — bez cichego zapisu `null`); dołożyć `color` do `insert(...).values`. Reużyj: `normalizeColor`.
- `src/app/api/companies/[id]/route.ts` (PATCH) — jeśli `body.color !== undefined`: `normalizeColor(...)`, `!ok` → `400`, inaczej `updates.color = value` (dozwolone `null` = wyczyszczenie). Zmiana samego koloru daje niepuste `updates` → nie wpada w `400 "Brak zmian"`. Reużyj: `normalizeColor`.
- `src/components/charts/AllocationDonut.tsx` — rozszerzyć `AllocationSlice` o `color?: string | null`; `colorFor` liczyć jako `s.name === "Inne" ? OTHER_COLOR : (resolveColorBackground(s.color) ?? PALETTE[i % PALETTE.length])`, wspólnie dla `Cell` i swatcha legendy. `foldSlices` niesie `color` w slice'ach head; „Inne" powstaje bez `color`. Reużyj: `resolveColorBackground`.
- `src/app/page.tsx` — (a) w danych donuta (~l.401) dodać `color: h.company.color` do mapowania `summary.holdings`; (b) karta newsów na dashboardzie (~l.153-167): `CompanyLogo` dostaje `color={c.color}`, a badge (`<Badge tone="accent">`, l.165) przechodzi na wypełnione tło (`avatarBackground`/`avatarInk`, `c` = wpis `NewsListItem.companies` z nowym `color`). Reużyj: `avatarBackground`/`avatarInk`, `resolveColorBackground`.
- `src/lib/news.ts` — rozszerzyć `NewsListItem.companies` o `color: string | null`; w `listNews` w zapytaniu `matches` dodać `color: companies.color` i wpisywać go do `matchesByNews`. To jedno przenosi kolor do **obu** powierzchni newsów (dashboard + `/news`) oraz kolejnych stron infinite-scroll (GET `/api/news` zwraca `listNews`).
- `src/components/NewsInfiniteList.tsx` — badge spółki (~l.144-150): wypełnione tło `avatarBackground(c.color, c.ticker)` / tekst `avatarInk(c.color, c.ticker)`. Reużyj: util + rozszerzony `Badge`.
- `src/components/ui.tsx` — rozszerzyć `Badge` o opcjonalne `bg?: string; ink?: string`: gdy `bg` ustawione, renderować `style={{ background: bg, color: ink }}` i `border-transparent`, pomijając klasy `tone`. Bez `bg` — zachowanie bez zmian.
- Pozostałe call-sites `CompanyLogo` (dodać `color=...`):
  - `src/app/portfolio/page.tsx` — holdings: `color={h.company.color}`; sells/dividends/transakcje: `color={companyById.get(...)?.color ?? null}` (`companyById` już trzyma pełne `Company`, l.52).
  - `src/app/watchlist/page.tsx` — `color={c.color}` (pełne `Company`).
  - `src/app/companies/[id]/page.tsx` — nagłówek: `color={company.color}`.

Istniejące utility do reużycia (bez pisania od zera): `getLogoFlags`/`hasLogo` (`src/lib/logos.ts`) — bez zmian; `PALETTE`/`OTHER_COLOR` w `AllocationDonut`; tokeny `--color-cat-*`/`--color-cat-ink` w `src/app/globals.css` — bez zmian; `Label`/`Input`/`Badge` w `src/components/ui.tsx`.

## Kryteria akceptacji

- [ ] W `CompanyForm` można ustawić kolor presetem, własnym hexem, oraz wyczyścić go do „brak"; wartość zapisuje się (POST i PATCH) i wraca przy edycji.
- [ ] `companies.color` istnieje po świeżym `createDb()` (BOOTSTRAP) **i** po migracji istniejącej bazy; równoległe workery `next build` nie dają „duplicate column"/`SQLITE_BUSY`.
- [ ] Alokacja: spółka z kolorem ma wycinek/legendę w swoim kolorze (preset adaptuje się do motywu; hex stały); spółka bez koloru zachowuje kolor slotu; „Inne" szare.
- [ ] Awatar-fallback (portfel, watchlista, dashboard, nagłówek spółki, karty mobilne) używa koloru spółki; gdy jest pobrane logo — pokazuje logo, nie kolor.
- [ ] Badge newsa (dashboard **i** `/news`, także doklejane strony) ma wypełnione tło: własny kolor lub kolor z hasha; tekst czytelny (kontrast) w obu motywach.
- [ ] Brak hydration mismatch na `/`, `/portfolio`, `/watchlist`, `/news`, `/companies/[id]` (SSR = klient; wartości `var(...)`/hex deterministyczne).
- [ ] Pole koloru i badge poprawne na ~360–390px.
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się i feature działa w preview (przejechana ścieżka: dodanie spółki z presetem, z hexem, bez koloru → weryfikacja w alokacji, awatarze i newsach).

## Ryzyka

- **Migracja pod równoległymi workerami `next build`** — jedyny bezpieczny wzorzec to read-only guard + re-check wewnątrz write-transakcji (jak `migrateCompanyDomain`); odstępstwo grozi `duplicate column`/`SQLITE_BUSY`. Trzymać kalkę 1:1.
- **Kontrast dla hexa** — źle dobrany hex + zła funkcja atramentu = nieczytelny tekst. Próg YIQ/luminancji dobrać i sprawdzić na skrajnych kolorach (czysty żółty, czysty granat) w obu motywach.
- **Hex nie adaptuje się do motywu** — świadome; użytkownik może wpisać kolor słabo kontrastujący z tłem karty w jednym z motywów. Akceptowalne (to jego wybór); presety są rekomendowaną, theme-aware ścieżką.
- **`foldSlices` gubi `color`** — upewnić się, że `color` jedzie z każdym head-slice przez sort/fold; „Inne" celowo bez koloru.
- **Rozjazd fallbacku hash** — po wyniesieniu `hashString`/`AVATAR_TOKENS` do utila kolor awatara musi zostać identyczny jak dziś (te same 8 tokenów, ten sam modulo na `ticker.toUpperCase()`), inaczej istniejące awatary zmienią kolor.
- **Badge z inline `style`** — rozszerzenie `Badge` nie może zepsuć dotychczasowych wariantów `tone` (ścieżka bez `bg` bez zmian).
- **Walidacja PATCH** — `color: null` musi być odróżnione od „nie podano" (`undefined`), żeby dało się wyczyścić kolor i żeby nie wpaść w `400 "Brak zmian"`.

## Decyzje (runda doprecyzowania)

- **Nieprawidłowy `color` w API** → **`400`** (POST i PATCH), bez cichego zapisu `null` — parytet ze „surową walidacją PATCH" z ostatnich commitów. `null`/`""` to poprawna wartość (wyczyszczenie koloru), nie błąd.
- **`cat-other` jest wybieralnym presetem** w `CompanyForm` (9 swatchy: `cat-1..8` + `cat-other`), zgodnie z opisem featurea. W donucie „Inne" pozostaje szare niezależnie od koloru spółek.

## Pytania do doprecyzowania

Brak otwartych pytań — wszystkie rozstrzygnięte powyżej.
