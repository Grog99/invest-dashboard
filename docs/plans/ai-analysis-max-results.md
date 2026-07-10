# Konfigurowalny `max_results` web searchu w analizie AI

> Plan wygenerowany przez skill `/plan-feature`. Slug: `ai-analysis-max-results`. Branch: `feature/ai-analysis-max-results`.

## Kontekst / Problem

Modal „Analiza AI" (`src/components/AiAnalyzeModal.tsx`) + endpoint non-streaming `POST /api/ai/analyze` pozwalają dziś włączyć web search OpenRoutera (plugin `web`), ale **głębokość researchu jest zahardkodowana**: `buildWebPlugins()` w `src/lib/ai.ts:165–169` zawsze zwraca `[{ id: "web", max_results: 5 }]`. Liczba przeszukiwanych stron (`max_results`) to najsilniejszy pojedynczy pokrętło jakości vs koszt/czas researchu — więcej wyników = model widzi więcej źródeł, ale zapytanie kosztuje więcej i trwa dłużej.

`max_results` **nie jest nowym konceptem** — istnieje w kodzie, tylko sztywno ustawiony na `5`. Oryginalny plan web searchu `docs/plans/ai-analiza-notatki.md` (linie 44, 62–84, 133) świadomie odłożył jego tunowalność jako non-goal MVP („MVP stałe `max_results:5`, bez suwaka"). Ten feature to właśnie odblokowanie tego odłożonego parametru.

Feature jest **bezpośrednią kontynuacją** poprzedniego (`docs/plans/openrouter-analiza-ai-config.md`, commit `d8dc2d1`), który dodał konfigurowalność `temperature`/`top_p`/`reasoning_effort` dokładnie tym samym wzorcem: **domyślna w Ustawieniach + override per uruchomienie w modalu**, z fallbackiem `override ?? default ?? pominięcie` rozstrzyganym centralnie w `openrouterChat`. Kopiujemy ten wzorzec 1:1, z jedną różnicą typu kontrolki: `max_results` to **Select z gotowymi opcjami** (nie number input), bo sensownych wartości jest kilka i wiążą się z progami cenowymi.

Cel: użytkownik ustawia domyślną liczbę wyników web searchu w Ustawieniach ORAZ może ją nadpisać na jedną analizę w modalu; kontrolka pojawia się tylko wtedy, gdy web search jest włączony; opis kosztu sygnalizuje, że więcej wyników = wyższy koszt/czas.

## Wymagania

**Funkcjonalne:**
- W Ustawieniach (`AiSettingsForm`, karta „AI — OpenRouter") dochodzi pole **Liczba wyników web searchu** (globalne domyślne) — `Select` z opcjami `3 / 5 / 10 / 15 / 20` + opcja „Domyślne providera (5)". Puste = „nie wysyłaj `max_results`, użyj domyślnej OpenRoutera" (= 5, bez regresji względem dzisiejszego zachowania).
- W modalu „Analiza AI" dochodzi ta sama kontrolka jako **override per uruchomienie**; puste → używana wartość globalna z Ustawień. Placeholder/opcja domyślna pokazuje wartość globalną (jak dziś reasoning effort).
- **Zależność UI (decyzja użytkownika):** w modalu pole `max_results` jest **ukryte, gdy checkbox „Web search" jest odznaczony** — pojawia się dopiero po zaznaczeniu (analogicznie jak reszta UI specyficzna dla web searchu). W Ustawieniach globalnych nie ma checkboxa „web search" (web search jest per-run), więc pole jest tam zawsze widoczne jako domyślna używana zawsze, gdy w którejkolwiek analizie web search zostanie włączony.
- Efektywna wartość: `override z modalu ?? domyślna z Ustawień ?? pominięcie parametru` (fallback rozstrzygany centralnie w `openrouterChat`, jak dziś dla `model`/`temperature`/`topP`/`reasoning`). `max_results` wysyłany do OpenRoutera tylko, gdy web search jest włączony.
- Walidacja: `max_results` ∈ zbiór dozwolonych opcji (`3 / 5 / 10 / 15 / 20`); wartość spoza zbioru → `400` (w route) / brak zapisu (w `/api/settings`), spójnie z walidacją reasoning effort.
- **Opis kosztu (decyzja użytkownika):** zaktualizować istniejącą notkę pod checkboxem „Web search" (`AiAnalyzeModal.tsx:226–228`), żeby zasygnalizowała, że większa liczba wyników = potencjalnie wyższy koszt i dłuższy czas zapytania.

**Niefunkcjonalne:**
- Nowa kontrolka w modalu i w formularzu Ustawień responsywna na ~360–390 px (wymóg `AGENTS.md`): `Select` z `ui.tsx` jest `w-full` → pionowy stack out-of-the-box, brak poziomego scrolla. W modalu pole ląduje w pełnej szerokości pod notką web searchu.
- Zmiany tylko w ścieżce **non-streaming** `/api/ai/analyze` + Ustawieniach. Streamingowy czat (`AiChat.tsx`, `/api/ai/chat`, `src/lib/sse.ts`) nietknięty — dziś woła `openrouterChat(..., { stream: true })` bez `webSearch`/`maxResults` (`src/app/api/ai/chat/route.ts:33–36`), więc dołożenie opcjonalnego `maxResults` jest w pełni additive.
- Klucz ustawienia w prostej tabeli k-v `settings` (`src/db/schema.ts:172–175`, `key` PK + `value` NOT NULL) — bez migracji, nowy klucz wchodzi leniwie przez `setSetting`.

## Zakres i Non-goals

**W zakresie:**
- `max_results` pluginu `web` — domyślny w Ustawieniach + override w modalu, jako `Select` z gotowymi opcjami.
- Odblokowanie sztywnego `max_results: 5` w `buildWebPlugins` (`src/lib/ai.ts`) na parametr sterowany z góry.
- Rozszerzenie istniejących: `buildWebPlugins`/`openrouterChat`/`getAiConfig` (`src/lib/ai.ts`), `SETTING_KEYS` + walidator/parser (`src/lib/settings.ts`), stała opcji (`src/lib/ai-types.ts`), `/api/ai/analyze`, `/api/settings`, `AiSettingsForm`, `settings/page.tsx`, `AiAnalyzeModal`, `NoteEditor`, obie strony `research/*`.
- Aktualizacja notki o koszcie web searchu w modalu.

**Non-goals (świadomie pomijamy — kontynuacja decyzji z `docs/plans/ai-analiza-notatki.md` i `openrouter-analiza-ai-config.md`):**
- **Domain filtering** pluginu `web` (`plugins[].web.allowed_domains`/`blocked_domains`) — poza zakresem.
- **Wybór silnika** web searchu (`engine: "native" | "exa"`) — zostaje domyślny (native z fallbackiem exa), nie ustawiamy.
- **`search_prompt`** / własna instrukcja pluginu — zostaje domyślna OpenRoutera (data + cytowanie linkami markdown).
- **`web_search_options.search_context_size`** (osobny parametr natywnego searchu) — nie dodajemy.
- **Dowolny number input** dla `max_results` — świadomie `Select` z gotowymi opcjami (decyzja użytkownika), nie wolna liczba.
- **Rozszerzenie web searchu na streaming** (`AiChat.tsx` / `/api/ai/chat`) — poza zakresem (streaming nie ma dziś web searchu).
- **Osobna migracja schematu** — tabela `settings` to k-v, nowy klucz dochodzi leniwie.
- **Zapamiętywanie override'u modala między sesjami** — efemeryczne, jak dziś model/webSearch/temperature.

## Podejście

> Reguła z `AGENTS.md` („to NIE jest Next.js, który znasz"): feature **nie wprowadza żadnego nowego API Next.js**. Rozszerzamy istniejące route handlery `src/app/api/ai/analyze/route.ts` i `src/app/api/settings/route.ts`, które używają dokładnie tych samych konstrukcji co reszta repo: `NextRequest`/`NextResponse.json(...)`, `export const maxDuration = 300`. Kopiujemy 1:1 istniejący wzorzec (`temperature`/`topP`/`reasoning`). **Uwaga wykonawcza:** w tym środowisku `node_modules/` nie jest zainstalowane (`next` `16.2.10` wg `package.json`), więc `node_modules/next/dist/docs/` nie dało się przeczytać na żywo — wzorce potwierdzone działającym kodem repo. Implementator z zależnościami POWINIEN zerknąć do przewodnika route-handlers, jeśli wyjdzie poza kopiowanie istniejącego wzorca.

**1. Fallback rozstrzygany w `openrouterChat` (DRY, jak dla `temperature`/`reasoning`).**
`openrouterChat` już dziś robi `temperature = options.temperature ?? defaultTemperature ?? undefined` (`ai.ts:210–214`). Powielamy dla `max_results`: `getAiConfig()` zwraca też `webSearchMaxResults: number | null`, a `openrouterChat` bierze `options.maxResults ?? cfg.webSearchMaxResults ?? undefined` i przekazuje do `buildWebPlugins`. Route pozostaje cienki.

**2. `buildWebPlugins` przyjmuje `maxResults`.**
Sygnatura: `buildWebPlugins(webSearch?: boolean, maxResults?: number | null)`. Gdy web search włączony: `[{ id: "web", ...(maxResults != null ? { max_results: maxResults } : {}) }]`. **Gdy `maxResults` jest `null` — pomijamy pole `max_results`**, co jest tożsame z dzisiejszym zachowaniem (OpenRouter domyślnie stosuje `5`, potwierdzone w docs OpenRoutera). Dzięki temu „puste" ustawienie = dzisiejszy stan, brak regresji. (Typ zwracany trzeba poluzować z obecnego `max_results: number` — obowiązkowego — na opcjonalny `max_results?: number`.)

**3. Opcje jako współdzielona stała (klient/serwer), wzorem `REASONING_EFFORTS`.**
Zbiór opcji ląduje w `src/lib/ai-types.ts` (klient-safe, bez `@/db`): `export const WEB_SEARCH_MAX_RESULTS = [3, 5, 10, 15, 20] as const`. `src/lib/settings.ts` re-eksportuje (jak dziś `REASONING_EFFORTS`), a walidator `isValidMaxResults(n)` sprawdza przynależność do tego zbioru — 1:1 kopia `isValidReasoningEffort`. Komponenty klienta (`AiSettingsForm`, `AiAnalyzeModal`) importują listę z `@/lib/ai-types`, nie z `@/lib/settings`, żeby nie wciągać `better-sqlite3` do bundla przeglądarki.

**Dobór opcji `3 / 5 / 10 / 15 / 20` (uzasadnienie):**
- **Model kosztu OpenRoutera / silnik Exa:** ~$0.005 za zapytanie web search obejmuje **do 10 wyników**; każdy wynik powyżej 10 to +$0.001. Stąd naturalne progi: `3` (tanio/szybko), `5` (domyślna providera), `10` (górny próg „w cenie bazowej"), `15`/`20` (głębszy research z dopłatą +$0.005/+$0.01).
- **Górny limit `20`** dobrany jako bezpieczny sufit — OpenRouter **nie dokumentuje twardego maksimum** `max_results` (patrz Ryzyka: założenie). Trzymamy się rozsądnego zakresu; gdyby okazało się, że provider tnie/odrzuca duże wartości, wystarczy zmienić stałą `WEB_SEARCH_MAX_RESULTS`.
- **Domyślna = 5** (= dzisiejszy hardcode i default OpenRoutera), więc zachowanie „out of the box" bez zmian.

**4. „Puste = domyślne providera" — spójnie z konwencją repo.**
W k-v `settings` przechowujemy string; **pusty string = „nie wysyłaj `max_results`"** (OpenRouter użyje 5). W modalu puste override = użyj globalnej. `Select` w Ustawieniach ma pierwszą opcję `""` = „Domyślne providera (5 wyników)", potem `3/5/10/15/20`. W modalu pierwsza opcja `""` = „Domyślne (globalne)" (+ wartość globalna w etykiecie, jak dziś reasoning effort). Parser `parseMaxResultsSetting(value)` — kopia `parseReasoningEffortSetting`: pusty/niepoprawny → `null`.

**5. Kontrolka w modalu tylko przy włączonym web searchu.**
`max_results` ma sens wyłącznie z web searchem, więc render warunkowy: `{webSearch && ( <Select …/> )}` tuż pod blokiem checkboxa/notki (`AiAnalyzeModal.tsx:216–231`). Odrzucona alternatywa: zawsze widoczny, `disabled` gdy checkbox off — działa, ale hidden jest czystsze wizualnie i spójne z tym, że pole nie ma znaczenia bez web searchu. W `run()` `maxResults` wysyłany tylko gdy `webSearch` włączony (analogicznie: parametr web-search-specific).

**6. Aktualizacja notki o koszcie.**
Dziś (`AiAnalyzeModal.tsx:227`): _„Model przeszuka internet i zacytuje źródła — może zwiększyć koszt zapytania."_ Zmieniamy na krótką, ogólną treść: _„Model przeszuka internet i zacytuje źródła — dolicza się nawet przy darmowych modelach."_ Dodatkowo osobna mikro-notka `<p className="text-[11px] text-muted">` pod samym `Select` z konkretem cenowym: _„do 10 wyników ~$0.005, każdy kolejny +$0.001"._

## Pliki do zmiany

**Baza (warstwa danych):**

- `src/lib/ai-types.ts` — dodać `export const WEB_SEARCH_MAX_RESULTS = [3, 5, 10, 15, 20] as const;` oraz `export type WebSearchMaxResults = (typeof WEB_SEARCH_MAX_RESULTS)[number];` (obok istniejących `REASONING_EFFORTS`/`ReasoningEffort`). Plik jest klient-safe (bez `@/db`), więc komponenty mogą importować listę bez wciągania Node-only modułów.
- `src/lib/settings.ts`:
  - Re-eksport `WEB_SEARCH_MAX_RESULTS` / `WebSearchMaxResults` (jak dziś `REASONING_EFFORTS` w linii 8).
  - Do `SETTING_KEYS` (linie 11–21) dodać `aiWebSearchMaxResults: "ai_web_search_max_results"`.
  - Nowy walidator `isValidMaxResults(value: number): value is WebSearchMaxResults` — kopia `isValidReasoningEffort` (linie 78–82): `Number.isInteger(value) && (WEB_SEARCH_MAX_RESULTS as readonly number[]).includes(value)`.
  - Nowy parser `parseMaxResultsSetting(value: string | null): number | null` — kopia `parseReasoningEffortSetting` (linie 100–105): pusty/`null` → `null`; `const n = Number(value); return isValidMaxResults(n) ? n : null;`.
  - Reużyć istniejące `getSetting`/`setSetting`. **Bez zmian w `src/db/schema.ts`** (k-v).
- `src/lib/ai.ts`:
  - `getAiConfig()` (linie 29–47) — rozszerzyć zwracany obiekt o `webSearchMaxResults: number | null` (przez `parseMaxResultsSetting(getSetting(SETTING_KEYS.aiWebSearchMaxResults))`). Additive — istniejący `{ apiKey, model, temperature, topP, reasoningEffort }` bez zmian.
  - `buildWebPlugins` (linie 165–169) — sygnatura `(webSearch?: boolean, maxResults?: number | null)`; zwraca `webSearch ? [{ id: "web", ...(maxResults != null ? { max_results: maxResults } : {}) }] : undefined`. Typ zwracany: `Array<{ id: "web"; max_results?: number }> | undefined`.
  - `openrouterChat` (linie 185–233) — do `options` dołożyć `maxResults?: number`. Z `getAiConfig()` wyciągnąć `webSearchMaxResults` (destrukturyzacja obok `temperature`/`topP`/`reasoningEffort`). Zmienić wywołanie `buildWebPlugins(options.webSearch)` (linia 209) na `buildWebPlugins(options.webSearch, options.maxResults ?? webSearchMaxResults ?? undefined)`. Body OpenRoutera i zwracany typ (`Response`) bez innych zmian.

**Backend (warstwa backend):**

- `src/app/api/ai/analyze/route.ts` (wzorzec: obecne parsowanie/walidacja `temperature`/`topP`/`reasoningEffort`, linie 38–67):
  - Sparsować `maxResults` z body: `const maxResults = typeof body.maxResults === "number" && Number.isFinite(body.maxResults) ? body.maxResults : undefined;`
  - Walidacja: `if (maxResults !== undefined && !isValidMaxResults(maxResults)) return NextResponse.json({ error: "Liczba wyników web searchu musi być jedną z: 3, 5, 10, 15, 20." }, { status: 400 });` (import `isValidMaxResults` z `@/lib/settings` obok istniejących).
  - Przekazać do `openrouterChat(msgs, { stream: false, model, webSearch, temperature, topP, reasoning: reasoningEffort, maxResults })` (linia ~104). Reszta (odczyt `usage`, zwrot `{ content, usage }`) bez zmian.
- `src/app/api/settings/route.ts` (wzorzec: blok temperature/topP/reasoningEffort, linie 75–110):
  - `GET` (linie 17–30) — dołożyć `webSearchMaxResults: getSetting(SETTING_KEYS.aiWebSearchMaxResults) ?? ""`.
  - `POST` — walidacja: `if (typeof body.webSearchMaxResults === "string") { const trimmed = body.webSearchMaxResults.trim(); if (trimmed && !isValidMaxResults(Number(trimmed))) return NextResponse.json({ error: "Liczba wyników web searchu musi być jedną z: 3, 5, 10, 15, 20." }, { status: 400 }); }` (import `isValidMaxResults`). Zapis: `if (typeof body.webSearchMaxResults === "string") setSetting(SETTING_KEYS.aiWebSearchMaxResults, body.webSearchMaxResults.trim());` — pusty czyści, jak temperature (linie 102–110). `reloadScheduler()` NIE dotyczy (tylko cron).

**Frontend (warstwa frontend):**

- `src/components/AiSettingsForm.tsx` — reużyć `Select`/`Label` z `src/components/ui.tsx` (nie pisać własnego pola). Import `WEB_SEARCH_MAX_RESULTS` z `@/lib/ai-types`. Nowy prop `webSearchMaxResults: string` (string z page, `""` = brak). Stan `webSearchMaxResultsValue`. Nowy `Select` (opcja `""` = „Domyślne providera (5 wyników)" + `WEB_SEARCH_MAX_RESULTS.map(n => <option value={n}>{n} wyników</option>)`), poniżej sekcji reasoning effort (po linii 167). Dołożyć `webSearchMaxResults: webSearchMaxResultsValue.trim()` do `payload` w `save()` (linie 43–48). Krótkie `<p className="text-[11px] text-muted">` z wyjaśnieniem (liczba stron przeszukiwanych przy web searchu; wpływ na koszt/czas). **Mobile:** `Select` jest `w-full` → działa na ~360 px bez zmian.
- `src/app/settings/page.tsx` — odczytać `const webSearchMaxResults = getSetting(SETTING_KEYS.aiWebSearchMaxResults) ?? "";` (obok linii 22–24) i przekazać do `<AiSettingsForm ... webSearchMaxResults={webSearchMaxResults} />` (blok 48–57).
- `src/components/AiAnalyzeModal.tsx` — reużyć `Select`/`Label` z `ui.tsx`. Import `WEB_SEARCH_MAX_RESULTS` z `@/lib/ai-types`.
  - Nowy prop `defaultMaxResults?: string` (obok `defaultTemperature`/`defaultTopP`/`defaultReasoningEffort`, linie 68–71/84–87).
  - Nowy stan `const [maxResults, setMaxResults] = useState("");` (`""` = użyj globalnej).
  - **Kontrolka warunkowa** — pod blokiem checkboxa „Web search" (linie 216–231): `{webSearch && ( <div> <Label htmlFor="ai-modal-max-results">Liczba wyników</Label> <Select value={maxResults} onChange={…}> <option value="">Domyślne (globalne{defaultMaxResults ? `: ${defaultMaxResults}` : ""})</option> {WEB_SEARCH_MAX_RESULTS.map(n => <option value={n}>{n} wyników</option>)} </Select> </div> )}` — full-width, stack na mobile.
  - W `run()` (body `fetch`, linie 140–150) dołożyć `maxResults: webSearch && maxResults ? Number(maxResults) : undefined` (wysyłane tylko przy włączonym web searchu).
  - **Aktualizacja notki o koszcie** (linie 226–228) — nowa treść sygnalizująca wpływ liczby wyników (patrz Podejście pkt 6 / Pytania).
- `src/components/NoteEditor.tsx` — przyjąć nowy prop `defaultMaxResults?: string` (obok istniejących `defaultTemperature`/`defaultTopP`/`defaultReasoningEffort`, linie 35–47) i forwardować do `<AiAnalyzeModal ... defaultMaxResults={defaultMaxResults} />` (linie 361–374). Bez innej logiki.
- `src/app/research/new/page.tsx` **oraz** `src/app/research/[id]/page.tsx` — oba destrukturyzują `getAiConfig()` (odpowiednio linie 27–32 i 26–31); dodać `webSearchMaxResults` i przekazać do `NoteEditor` jako `defaultMaxResults={webSearchMaxResults != null ? String(webSearchMaxResults) : ""}` (obok istniejących `defaultTemperature`/`defaultTopP`/`defaultReasoningEffort`).
- `src/components/AiChat.tsx`, `src/lib/sse.ts`, `src/app/api/ai/chat/route.ts` — **BEZ ZMIAN** (streaming / brak web searchu poza zakresem).

## Kryteria akceptacji

- [ ] W Ustawieniach → „AI — OpenRouter" jest `Select` „Liczba wyników web searchu" z opcjami Domyślne(5)/3/5/10/15/20; zapis działa, wartość utrzymuje się po `router.refresh()`.
- [ ] W modalu „Analiza AI" pole liczby wyników jest **ukryte, gdy „Web search" odznaczony**, i pojawia się po zaznaczeniu; opcja domyślna pokazuje wartość globalną.
- [ ] Puste ustawienie globalne = brak `max_results` w body pluginu (OpenRouter stosuje 5) — dzisiejsze zachowanie bez regresji (weryfikacja w podglądzie network/logach: `plugins:[{id:"web"}]` bez `max_results` albo z `max_results` gdy ustawiony).
- [ ] Override w modalu nadpisuje globalną tylko dla tej analizy; np. ustawienie `15` → body zawiera `plugins:[{id:"web",max_results:15}]`.
- [ ] Walidacja: wartość spoza `{3,5,10,15,20}` → `400` w `/api/ai/analyze` i brak zapisu w `/api/settings`, z czytelnym komunikatem.
- [ ] Zaktualizowana notka pod checkboxem „Web search" sygnalizuje, że więcej wyników = wyższy koszt/czas.
- [ ] Streaming (`AiChat` / `/api/ai/chat`) działa jak wcześniej — brak regresji (nadal `{ stream: true }` bez `maxResults`).
- [ ] Nowa kontrolka czytelna i obsługiwalna na ~360–390 px (full-width, pionowy stack, brak poziomego scrolla) — zweryfikowane w przeglądarce (wymóg `AGENTS.md`).
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się; oba tryby analizy z web searchem działają z domyślną i override'em liczby wyników w preview.

## Ryzyka

- **Brak udokumentowanego twardego maksimum `max_results` w OpenRouterze (ZAŁOŻENIE).** Potwierdzone przez WebSearch: default = `5`; brak oficjalnego górnego limitu w publicznej dokumentacji (docs OpenRoutera zwracają HTTP 403 dla botów, więc bez WebFetch — jak w poprzednich planach). Górny próg `20` dobrany jako bezpieczny sufit. Gdyby provider tnął/odrzucał duże wartości — jedyna zmiana to stała `WEB_SEARCH_MAX_RESULTS`. Model cenowy (Exa engine): ~$0.005/zapytanie do 10 wyników, +$0.001 za każdy kolejny — do potwierdzenia w teście manualnym (podgląd `usage` w odpowiedzi, feature z poprzedniego planu już pokazuje koszt w modalu, co ułatwia weryfikację realnego wpływu `max_results`).
- **Zmiana typu zwracanego `buildWebPlugins`** z `max_results: number` (obowiązkowego) na `max_results?: number` (opcjonalnego) — sprawdzić, czy `npm run build` się kompiluje (brak innych konsumentów typu poza `openrouterChat`; grep potwierdził jedynego callera).
- **Spójność `getAiConfig()`** — rozszerzenie zwracanego obiektu additive; potwierdzić, że wszyscy callerzy (`/api/ai/chat` przez `openrouterChat`, `research/new`, `research/[id]`, `settings/page`) nadal się kompilują (`npm run build`).
- **`node_modules` niezainstalowane w środowisku planowania** — nie dało się przeczytać `node_modules/next/dist/docs/` (reguła `AGENTS.md`). Feature nie dodaje nowego API Next.js (kopiuje istniejące route handlery), więc ryzyko niskie; implementator z zależnościami niech zerknie do przewodnika route-handlers, jeśli wyjdzie poza kopiowanie wzorca.
- **Brak testów jednostkowych/e2e w repo** (brak plików `*.test.*`, `lint` = eslint, `build` = next build) — weryfikacja wyłącznie przez lint/build + ręczny preview. Nie ma testów do rozszerzenia.
- **Koszt web searchu dolicza się nawet przy darmowych modelach** — notka w UI ma to jasno komunikować; nie zmieniamy domyślnego stanu checkboxa (pozostaje wyłączony).

## Pytania do doprecyzowania

_Brak otwartych pytań — wszystkie decyzje UX/zakresu podjęte:_

- **Opcja domyślna w `Select`**: pierwsza opcja `""` = „Domyślne providera (5 wyników)" (spójne z konwencją „puste = nie wysyłaj parametru" z reasoning effort), obok jawnej opcji `5` w liście. Behawioralnie `""` i `5` są tożsame (oba → 5 po stronie OpenRoutera).
- **Notka o koszcie** (`AiAnalyzeModal.tsx:227`): główna notka pod checkboxem zostaje krótka i ogólna — „Model przeszuka internet i zacytuje źródła — dolicza się nawet przy darmowych modelach." — plus osobna mikro-notka (`text-[11px] text-muted`) pod samym `Select`, z konkretem cenowym: „do 10 wyników ~$0.005, każdy kolejny +$0.001".
