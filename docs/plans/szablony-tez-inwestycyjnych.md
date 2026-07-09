# Szablony tez inwestycyjnych

> Plan wygenerowany przez skill `/plan-feature`. Slug: `szablony-tez-inwestycyjnych`. Branch: `feature/szablony-tez-inwestycyjnych`.
> Pozycja roadmapy: **5.5** (sekcja „Notatki"). Złożoność wg roadmapy: **S**. Zależności: brak.

## Kontekst / Problem

Dziś nowa notatka researchowa (`src/app/research/new/page.tsx` → `NoteEditor`) startuje jako pusta
textarea markdown. Nic nie wymusza dyscypliny procesu inwestycyjnego — łatwo napisać „lubię tę
spółkę", pominąć warunki wyjścia i ryzyka, a po fakcie nie pamiętać, dlaczego pozycja w ogóle
weszła do portfela. Roadmapa 5.5 proponuje predefiniowane szkielety markdown (Teza / Katalizatory /
Ryzyka / Wycena / Warunki wyjścia) wybierane przy tworzeniu notatki.

Efekt: każda pozycja ma spisaną tezę i warunki wyjścia w spójnej strukturze; struktura świetnie
współgra z czatem AI („oceń moją tezę") i z generowaniem analizy AI, które już dopisuje sekcje do
treści notatki (`generateAi()` w `NoteEditor.tsx`).

## Ustalenia (decyzje użytkownika — wiążące)

1. **Wariant rozszerzony.** Oprócz predefiniowanych szablonów **w kodzie** dochodzi tabela
   `note_templates` z pełnym CRUD (lista / dodaj / edytuj / usuń) **własnych** szablonów użytkownika,
   zarządzana w Ustawieniach.
2. **Kilka szablonów wbudowanych** (nie jeden). Obowiązkowo „Teza inwestycyjna" (Teza / Katalizatory /
   Ryzyka / Wycena / Warunki wyjścia) + 2 dodatkowe: „Szybka notatka" i „Podsumowanie wyników
   kwartalnych" (uzasadnienie w „Podejście").
3. **UX wyboru:** dropdown wyboru szablonu **nad edytorem** na stronie tworzenia notatki; wybór
   wypełnia treść markdown gotowym szkieletem, który dalej można edytować.
4. **Ochrona przed nadpisaniem:** dropdown jest **aktywny tylko gdy treść notatki jest pusta**
   (`disabled`, gdy treść niepusta). Bez `confirm()` — zero ryzyka utraty już napisanego tekstu.

## Wymagania

- Predefiniowane szablony (stałe w kodzie) dostępne od razu, bez konieczności seedowania bazy.
- Tabela `note_templates` z CRUD własnych szablonów w Ustawieniach (dodaj / edytuj / usuń).
- Dropdown wyboru szablonu na `src/app/research/new/page.tsx`, listujący **wbudowane + własne**.
- Dropdown `disabled`, gdy treść notatki jest niepusta (`content.trim().length > 0`).
- Wybór szablonu podmienia całą treść na szkielet markdown (edytowalny dalej).
- Nowy UI (dropdown w edytorze, sekcja szablonów w Ustawieniach) responsywny na ~360–390 px
  (twardy wymóg `AGENTS.md` / `docs/plans/pwa-wersja-mobilna.md`).
- `npm run lint` i `npm run build` przechodzą.

## Zakres i Non-goals

**W zakresie:**
- Stałe wbudowane szablony w `src/lib/templates.ts` (3 sztuki, pełna treść niżej).
- Tabela `note_templates` (Drizzle + BOOTSTRAP_SQL) na własne szablony użytkownika.
- REST API CRUD: `GET/POST /api/note-templates`, `PATCH/DELETE /api/note-templates/[id]`.
- Dropdown szablonu w `NoteEditor` (tylko w trybie tworzenia notatki, `disabled` gdy treść niepusta).
- Sekcja „Szablony notatek" w Ustawieniach (`TemplatesManager` — lista, dodaj, edytuj, usuń;
  wbudowane pokazane jako referencja z akcją „Duplikuj do moich").

**Non-goals (świadomie pomijamy):**
- **Ustawienie „domyślny szablon"** auto-wypełniający pustą notatkę — patrz „Pytania do
  doprecyzowania" (koliduje z regułą „aktywne tylko gdy pusto", więc świadomie odłożone).
- **Edytowalność szablonów wbudowanych** — pozostają stałymi w kodzie (można je „zduplikować do
  moich" i tam edytować). Patrz „Pytania".
- Wersjonowanie szablonów, kategorie/tagi szablonów, współdzielenie między instancjami.
- Zmiany w silniku AI (`buildCompanyContext`, `generateAi`) — szablony to czysty tekst startowy.
- Szablon jako osobny typ notatki / powiązanie szablon↔notatka po zapisie (notatka po wstawieniu
  szablonu jest zwykłą notatką, bez śladu, z którego szablonu powstała).

## Podejście

> Reguła z `AGENTS.md` — API Next.js zweryfikowane w `node_modules/next/dist/docs/`
> (`01-app/01-getting-started/15-route-handlers.md`): route handlery to `route.ts` w `app/`, eksporty
> `GET/POST/PATCH/DELETE`, kontekst dynamiczny jako `ctx.params` typu **Promise** (`await ctx.params`).
> Nie są cache'owane poza `GET` (a i to tylko opt-in). To dokładnie wzorzec, którego już używają
> istniejące trasy notatek i źródeł newsów — nowe trasy będą ich 1:1 kalką, bez nowych konwencji.

### 1. Wbudowane szablony = stałe w kodzie; `note_templates` = tylko szablony użytkownika

Decyzja 1 mówi wprost: „predefiniowane szablony **w kodzie** + tabela na własne". Realizujemy to
dosłownie jako **hybrydę**:

- `BUILTIN_TEMPLATES` — tablica stałych w `src/lib/templates.ts` (nie trafia do bazy).
- `note_templates` — trzyma **wyłącznie** szablony utworzone przez użytkownika.
- Dropdown w edytorze i lista w Ustawieniach **scalają** oba źródła (wbudowane w `optgroup`
  „Wbudowane", własne w `optgroup` „Moje szablony").

Dlaczego tak, a nie seed wbudowanych do bazy (odrzucona alternatywa): (a) stałe w kodzie są zawsze
dostępne — nie da się ich przypadkiem skasować ani „rozjechać" migracją; (b) w kolejnym wydaniu
dokładamy nowy wbudowany szablon jedną linią w tablicy — seed „tylko jeśli tabela pusta" (wzorzec
`seedDefaultSourcesIfEmpty`) NIE dołożyłby go, gdy użytkownik ma już własne wpisy; (c) mniej stanu w
bazie = mniej rzeczy do backupu/migracji. Koszt: szablonów wbudowanych nie da się edytować
inline — mitygujemy akcją „Duplikuj do moich" (kopiuje treść wbudowanego do formularza nowego
własnego szablonu).

### 2. Schemat i bootstrap — NOWA tabela, bez migracji `ALTER TABLE`

Kluczowa obserwacja z `src/db/index.ts`: helpery migracyjne (`migrateNewsDedup`,
`migrateCompanyType`, `migrateCompanyDomain`) istnieją **wyłącznie** po to, by dołożyć **kolumnę do
istniejącej tabeli** (czego `CREATE TABLE IF NOT EXISTS` nie robi na starej bazie). **Nowa tabela**
tego nie potrzebuje: `BOOTSTRAP_SQL` jest wykonywany `sqlite.exec(...)` przy każdym `createDb()`,
a `CREATE TABLE IF NOT EXISTS note_templates (...)` bezpiecznie utworzy ją zarówno na świeżej, jak i
na istniejącej bazie. **Żaden nowy helper `needs…Migration` / `migrate…` nie jest potrzebny.**

Schemat (spójny z tabelą `notes` — te same konwencje `created_at` / `updated_at`, snake_case w SQL,
camelCase w Drizzle):

```sql
CREATE TABLE IF NOT EXISTS note_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Drizzle (`src/db/schema.ts`):

```ts
// Własne (edytowalne) szablony notatek. Szablony WBUDOWANE są stałymi w
// src/lib/templates.ts i NIE trafiają tu — ta tabela to wyłącznie CRUD
// użytkownika (patrz docs/plans/szablony-tez-inwestycyjnych.md).
export const noteTemplates = sqliteTable("note_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  content: text("content").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export type NoteTemplate = typeof noteTemplates.$inferSelect;
```

### 3. Wstawianie szablonu w edytorze (tylko przy tworzeniu, `disabled` gdy niepusto)

`NoteEditor` jest współdzielony przez tworzenie (`new/page.tsx`, bez propa `note`) i edycję
(`[id]/page.tsx`, z `note`). Dropdown szablonu renderujemy **tylko w trybie tworzenia** (`!note`) —
w edycji notatka z definicji ma już treść i szablon nie ma sensu.

- Nowy prop `templates?: TemplateOption[]` (scalona lista wbudowane + własne; `{ key, label, group,
  content }`). Server component `new/page.tsx` przekazuje go; `[id]/page.tsx` — nie (undefined).
- Dropdown to istniejący komponent `Select` z `components/ui.tsx` z `<optgroup>` (natywny `<select>`
  wspiera optgroup; `Select` tylko spreaduje propsy na `<select>`, więc dzieci działają).
- `disabled={content.trim().length > 0}` — realizuje decyzję 4. Po wstawieniu szablonu treść staje
  się niepusta, więc dropdown sam się dezaktywuje (nie da się przypadkiem nadpisać). `value` selecta
  trzymamy pusty (placeholder „— wstaw szablon —"), a `onChange` woła `applyTemplate(key)` →
  `setContent(option.content)` i resetuje select do placeholdera.
- Krótki hint pod dropdownem zmienia treść zależnie od stanu: pusto → „Wstawia gotowy szkielet…",
  niepusto → „Dostępne, gdy treść notatki jest pusta." (czytelny powód `disabled`).

Umiejscowienie: **osobny wiersz nad paskiem Edycja/Podgląd** (nie w zatłoczonym pasku narzędzi z
przyciskami AI/załącznik), `Select` `w-full sm:max-w-xs` — czysto na ~360 px i zwięźle na desktopie.

### 4. Zarządzanie w Ustawieniach — nowa karta `TemplatesManager` (wzorzec `SourcesManager`)

Ustawienia to prosty stack `Card` (`src/app/settings/page.tsx`). Dokładamy `<Card title="Szablony
notatek">` z klienckim `TemplatesManager` — kalka architektury `SourcesManager` (lista + akcje +
formularz, `useRouter().refresh()` po mutacji). To trzyma spójność UX bez podstrony.

- **Lista własnych szablonów:** nazwa + krótki podgląd treści + przyciski „Edytuj" / „Usuń"
  (`confirm(...)` jak w `SourcesManager.remove`).
- **Dodaj / Edytuj:** reużywamy istniejący `Modal` (`components/Modal.tsx`) — formularz z `Input`
  (nazwa) + `Textarea` (treść markdown) + „Zapisz". Ten sam `Modal` obsługuje dodawanie (POST) i
  edycję (PATCH, formularz prefill).
- **Wbudowane (referencja, read-only):** lista nazw wbudowanych z akcją „Duplikuj do moich"
  (otwiera `Modal` dodawania prefillem treści wbudowanego) — pozwala oprzeć własny szablon na
  wbudowanym mimo braku edycji tych ostatnich.

Reużycie: `Modal`, `Button`, `Input`, `Label`, `Textarea`, `Badge`, `EmptyState` (wszystko z
`components/ui.tsx`), `useRouter`. Mobile: `Modal` jest już responsywny (`w-full max-w-md p-4`),
`Textarea` pełnej szerokości, lista to pionowy stack — działa na 360 px bez zmian.

## Pliki do zmiany

### Nowe pliki

- **`src/lib/templates.ts`** — stałe `BUILTIN_TEMPLATES: { slug: string; name: string; content:
  string }[]` (3 szablony, treści w sekcji niżej) + typ `TemplateOption = { key: string; label:
  string; group: "builtin" | "user"; content: string }` + helper `buildTemplateOptions(userTemplates:
  NoteTemplate[]): TemplateOption[]` scalający wbudowane (`key: "builtin:<slug>"`) i własne
  (`key: "user:<id>"`). Bez `"use client"` — importowalny po obu stronach.
- **`src/app/api/note-templates/route.ts`** — `GET` (lista własnych, `db.select().from(noteTemplates)
  .orderBy(asc(noteTemplates.name))`) + `POST` (walidacja: `name` wymagane; `content` = `String(body
  .content ?? "")`; `createdAt/updatedAt = nowISO()`; zwraca `{ template }`). Kalka
  `src/app/api/news-sources/route.ts` i `src/app/api/notes/route.ts`.
- **`src/app/api/note-templates/[id]/route.ts`** — `PATCH` (updates `name`/`content`, `updatedAt =
  nowISO()`, 404 gdy brak) + `DELETE` (`db.delete(...).where(eq(...)).run()`, `{ ok: true }`).
  Kalka `src/app/api/news-sources/[id]/route.ts` (ten sam `type Ctx = { params: Promise<{ id: string
  }> }`, `await ctx.params`).
- **`src/components/TemplatesManager.tsx`** — `"use client"`. Sekcja CRUD w Ustawieniach (opis w
  „Podejście" pkt 4). Reużyj `Modal`, `Button`, `Input`, `Label`, `Textarea`, `Badge`, `EmptyState`,
  `useRouter`.

### Modyfikowane pliki

- **`src/db/schema.ts`** — dodać tabelę `noteTemplates` + `export type NoteTemplate` (kod w
  „Podejście" pkt 2). Trzymać obok `notes` / `noteAttachments` dla czytelności.
- **`src/db/index.ts`** — dopisać `CREATE TABLE IF NOT EXISTS note_templates (...)` do
  `BOOTSTRAP_SQL` (przy pozostałych `CREATE TABLE`). **Bez** nowego helpera migracyjnego (nowa
  tabela, nie kolumna — uzasadnienie w „Podejście" pkt 2).
- **`src/components/NoteEditor.tsx`** — dodać prop `templates?: TemplateOption[]`; wyrenderować
  dropdown szablonu w nowym wierszu nad paskiem Edycja/Podgląd, tylko gdy `!note && templates?.length`;
  logika `applyTemplate` + `disabled` gdy `content.trim()` niepuste (opis w „Podejście" pkt 3).
  Reużyj istniejący `Select` z `./ui` (już importowany).
- **`src/app/research/new/page.tsx`** — pobrać własne szablony (`db.select().from(noteTemplates)
  .orderBy(asc(noteTemplates.name)).all()`), zbudować `buildTemplateOptions(...)` i przekazać do
  `<NoteEditor templates={...} />`. (`[id]/page.tsx` bez zmian — nie przekazuje `templates`.)
- **`src/app/settings/page.tsx`** — pobrać własne szablony i dodać `<Card title="Szablony notatek">`
  z `<TemplatesManager templates={...} builtins={BUILTIN_TEMPLATES} />`. Import `BUILTIN_TEMPLATES`
  z `@/lib/templates`.

### Reużywane utility/komponenty (bez pisania od zera)

- `Modal` (`src/components/Modal.tsx`) — formularz dodaj/edytuj szablon (Escape + blokada scrolla już
  w środku).
- `Select`, `Button`, `Input`, `Label`, `Textarea`, `Badge`, `EmptyState`, `Card`, `PageHeader`
  (`src/components/ui.tsx`).
- `nowISO` (`src/lib/format.ts`) — znaczniki czasu wierszy.
- Wzorce REST: `src/app/api/news-sources/route.ts` + `[id]/route.ts` (najbliższy odpowiednik CRUD),
  `src/app/api/notes/route.ts` + `[id]/route.ts`.
- Wzorzec komponentu zarządzania: `src/components/SourcesManager.tsx`.

## Treść domyślnych szablonów wbudowanych (seed w kodzie)

Trzy szablony. „Teza inwestycyjna" jest obowiązkowa (opis roadmapy). „Szybka notatka" i
„Podsumowanie wyników kwartalnych" dobrane, bo pokrywają dwa pozostałe częste tryby researchu:
lekki wpis „na już" (obserwacja rynkowa/makro bez pełnej analizy) oraz ustrukturyzowany przegląd
raportu okresowego (dobrze łączy się z tabelami markdown, które renderuje `Markdown.tsx`, i z
pozycją 4.4 roadmapy — import raportów). Kursywa `_…_` to instrukcje-placeholdery do skasowania.

### 1. „Teza inwestycyjna" (`slug: "teza"`)

```markdown
## Teza
_Dlaczego warto (lub nie warto) mieć tę spółkę w portfelu — w 2–3 zdaniach._

## Katalizatory
- _Co może pchnąć kurs w górę i w jakim horyzoncie?_
-

## Ryzyka
- _Co może pójść nie tak? Co obaliłoby tezę?_
-

## Wycena
_Aktualna wycena vs. wartość godziwa — mnożniki (P/E, EV/EBITDA), założenia, porównanie do peerów._

## Warunki wyjścia
- **Realizacja zysku:** _przy jakiej cenie / po spełnieniu jakiej tezy sprzedaję?_
- **Cięcie straty:** _co musi się wydarzyć, żebym uznał tezę za obaloną i wyszedł?_
```

### 2. „Szybka notatka" (`slug: "szybka"`)

```markdown
## Obserwacja
_Co zauważyłem / co się wydarzyło?_

## Wniosek
_Co z tego wynika? Co robię dalej?_

## Do sprawdzenia
-
```

### 3. „Podsumowanie wyników kwartalnych" (`slug: "wyniki-kwartalne"`)

```markdown
## Wyniki za [okres]
_Przychody, EBITDA, zysk netto — wartości oraz dynamika r/r i vs. konsensus._

## Kluczowe liczby
| Pozycja | Bieżący okres | Rok temu | Zmiana r/r |
| --- | --- | --- | --- |
| Przychody |  |  |  |
| EBITDA |  |  |  |
| Zysk netto |  |  |  |
| Marża netto |  |  |  |

## Co zaskoczyło (plus / minus)
-

## Komentarz zarządu / guidance
_Prognozy, plany, ton komunikacji._

## Wpływ na tezę
_Czy wyniki potwierdzają, czy podważają moją tezę inwestycyjną? Czy zmieniam pozycję?_
```

## Nowe / zmienione API routes

| Metoda + ścieżka | Body | Odpowiedź | Uwagi |
| --- | --- | --- | --- |
| `GET /api/note-templates` | — | `{ templates: NoteTemplate[] }` | Tylko własne (wbudowane są w kodzie). Głównie dla spójności; strony i tak czytają DB bezpośrednio (server components). |
| `POST /api/note-templates` | `{ name, content? }` | `{ template }` / `400` | `name` wymagane (`trim`), `content` opcjonalne. |
| `PATCH /api/note-templates/[id]` | `{ name?, content? }` | `{ template }` / `404` | `updatedAt = nowISO()`. |
| `DELETE /api/note-templates/[id]` | — | `{ ok: true }` | Twarde usunięcie (brak FK — bezpieczne). |

**Zmiany w istniejących trasach notatek: brak.** Wstawienie szablonu dzieje się w całości po stronie
klienta (`setContent`), a zapis notatki idzie istniejącym `POST /api/notes` bez zmian — notatka
utworzona z szablonu jest zwykłą notatką.

## Responsywność mobilna (~360–390 px)

- **Dropdown szablonu** w `NoteEditor` w osobnym wierszu, `Select` `w-full sm:max-w-xs` — nie tłoczy
  paska narzędzi (który na mobile i tak jest `flex flex-wrap`). Zweryfikować, że przy pełnej treści
  hint „Dostępne, gdy treść notatki jest pusta." nie łamie layoutu.
- **`TemplatesManager`** — lista to pionowy stack; przyciski akcji `flex flex-wrap gap-2`. `Modal`
  jest już responsywny (`w-full max-w-md p-4`), `Textarea` pełnej szerokości → edycja treści
  szablonu na telefonie działa bez poziomego scrolla.
- Weryfikacja w przeglądarce na 360 px zgodnie z `AGENTS.md`: strony `/research/new` i `/settings`.

## Kryteria akceptacji

- [ ] Na `/research/new` nad edytorem jest dropdown „— wstaw szablon —" z grupami „Wbudowane"
      (3 pozycje) i „Moje szablony" (własne, jeśli są).
- [ ] Wybór szablonu przy **pustej** treści wypełnia textarea szkieletem markdown; treść dalej
      edytowalna; podgląd (`Podgląd`) renderuje ją poprawnie (nagłówki, listy, tabela w „Wynikach").
- [ ] Dropdown jest `disabled`, gdy treść notatki jest niepusta — istniejący tekst nie da się
      nadpisać przez wybór szablonu.
- [ ] W edycji istniejącej notatki (`/research/[id]`) dropdown szablonu **nie** pojawia się.
- [ ] W Ustawieniach karta „Szablony notatek" pozwala: dodać własny szablon, edytować go, usunąć
      (z potwierdzeniem); zmiany są od razu widoczne w dropdownie na `/research/new` po odświeżeniu.
- [ ] „Duplikuj do moich" przy szablonie wbudowanym otwiera formularz nowego szablonu z wklejoną
      treścią wbudowanego.
- [ ] Świeża baza i istniejąca `data/invest.db` startują bez błędu (tabela `note_templates` tworzona
      przez `CREATE TABLE IF NOT EXISTS` w bootstrapie; brak nowej migracji kolumnowej).
- [ ] Nowy UI czytelny na 360 px (dropdown, karta w Ustawieniach, modal edycji) — brak poziomego
      scrolla strony.
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się w preview i pełna ścieżka (dodaj szablon w Ustawieniach → użyj go na
      `/research/new` → zapisz notatkę) działa end-to-end.

## Ryzyka

- **`<optgroup>` w komponencie `Select`.** `Select` z `ui.tsx` spreaduje propsy na natywny
  `<select>`, więc dzieci `<optgroup>`/`<option>` działają — ale warto potwierdzić wizualnie, że
  stylowanie (`bg-surface2`, `text-ink`) nie psuje grup na docelowej przeglądarce.
- **Kolizja id wbudowane vs własne.** Rozwiązane prefiksem klucza (`builtin:<slug>` / `user:<id>`) w
  `buildTemplateOptions` — `applyTemplate` szuka po `key`, nie po surowym id, więc brak kolizji.
- **Reset `value` selecta po wstawieniu.** Select musi wrócić do placeholdera po `onChange`
  (kontrolowany `value=""`), inaczej ponowny wybór tego samego szablonu nie odpali `onChange`. To i
  tak nie zaszkodzi, bo po wstawieniu dropdown jest `disabled` (treść niepusta), ale trzymamy
  kontrolowany pusty `value` dla spójności.
- **Świadomy brak walidacji markdownu.** Treść szablonu to dowolny tekst; renderer `Markdown.tsx`
  już bezpiecznie obsługuje dowolny markdown notatek, więc nowego wektora ryzyka nie ma.
- **Duplikacja źródeł prawdy szablonów.** Wbudowane w kodzie, własne w DB — scalenie tylko w
  `buildTemplateOptions`. Nie ma tu pułapek danych Yahoo/Stooq/NBP (feature czysto lokalny, bez
  zewnętrznych źródeł).

## Pytania do doprecyzowania

Wszystkie rozstrzygnięte w rundzie doprecyzowania — plan realizujemy dokładnie jak opisano wyżej:

- **Domyślny szablon:** pominięty w tej iteracji (non-goal, patrz „Zakres i Non-goals").
- **Edytowalność wbudowanych:** pozostają stałymi w kodzie (read-only), akcja „Duplikuj do moich"
  jako jedyna droga edycji ich treści.
- **Dodatkowe szablony:** zaakceptowane „Szybka notatka" i „Podsumowanie wyników kwartalnych" z
  treścią jak w sekcji „Treść domyślnych szablonów wbudowanych" — bez zmian.
```
