# Analiza AI w notatce — modal „Uzupełnij szkic / Wygeneruj od zera" + web search

> Plan wygenerowany przez skill `/plan-feature`. Slug: `ai-analiza-notatki`. Branch: `feature/ai-analiza-notatki`.

## Kontekst / Problem

Dziś w `src/components/NoteEditor.tsx` jest jeden przycisk „✦ Generuj analizę AI" (`generateAi`), który:
- **wymaga wybranej spółki**,
- streamuje analizę spółki (stały prompt `AI_RESEARCH_PROMPT`) przez `streamChat` → `POST /api/ai/chat`,
- **dokleja** wynik do notatki po nagłówku `---`.

Nie da się natomiast poprosić AI, żeby **uzupełniło/dokończyło bieżący szkic** (np. wypełniło wstawiony szablon „Teza inwestycyjna"), bo obecny flow ignoruje aktualną treść notatki — bierze tylko kontekst spółki. Nie ma też web searchu ani żadnej konfiguracji „per analiza" (model, dodatkowe instrukcje).

Cel: jeden przycisk na notatce otwiera **modal „Analiza AI"** z dwoma trybami działania, opcją web search (OpenRouter web plugin), polem dodatkowych instrukcji i override'em modelu. Tryb „Uzupełnij szkic" przekazuje AKTUALNĄ (nawet niezapisaną) treść notatki do AI i **nadpisuje** ją całą odpowiedzią.

## Wymagania

**Funkcjonalne:**
- Jeden przycisk na notatce (nowej i istniejącej) otwiera modal „Analiza AI".
- Modal ma wybór trybu (radio/segmented):
  - **Uzupełnij szkic** — wysyła aktualną treść notatki z edytora (stan `content`, także niezapisany), cała odpowiedź **NADPISUJE** treść notatki. Spółka opcjonalna.
  - **Wygeneruj od zera** — odpowiednik dzisiejszego zachowania: analiza spółki jako punkt wyjścia, **DOKLEJA** do notatki po nagłówku `---`. **Wymaga wybranej spółki** (decyzja użytkownika).
- **Oba tryby są NON-STREAMING** (decyzja użytkownika): klient wysyła całość, czeka na pełną odpowiedź, potem nadpisuje/dokleja. Jeden wspólny endpoint.
- Spółka **opcjonalna** dla trybu „Uzupełnij szkic": gdy wybrana → doklejamy kontekst przez `buildCompanyContext` (`src/lib/ai.ts`); bez spółki → sam szkic + ewentualny web search.
- Checkbox **Web search**: włączony → dodaje OpenRouter web plugin do requestu **oraz** dopisuje do system promptu instrukcję, że model powinien skorzystać z web searchu i cytować źródła.
- Pole tekstowe **Dodatkowe instrukcje** — doklejane do promptu (opcjonalne).
- **Override modelu** OpenRouter na tę jedną analizę (fallback: model globalny z Ustawień; pole free-text, jak w `AiSettingsForm.tsx`).

**Niefunkcjonalne:**
- Modal responsywny na ~360–390 px (wymóg z `AGENTS.md`) — pola full-width, brak niecollapsujących gridów, treść scrollowalna.
- Non-streaming request może trwać długo (web search + pełna notatka dokładają latencję) — odpowiednio dobrany timeout i `maxDuration`; wyraźny stan „Generuję…" (blokada przycisku), bo użytkownik czeka „ślepo" bez podglądu postępu.

## Zakres i Non-goals

**W zakresie:**
- Modal `AiAnalyzeModal` wpięty w `NoteEditor` (przycisk zamiast dzisiejszego „Generuj analizę AI").
- Rozszerzenie `openrouterChat` w `src/lib/ai.ts` o: override modelu, `plugins` (web), dedykowany prompt do uzupełniania szkicu i hint web search.
- **Jeden nowy endpoint non-streaming** `POST /api/ai/analyze` obsługujący oba tryby (`fill` i `generate`), zwracający `{ content }`.

**Non-goals (świadomie pomijamy):**
- **Streaming w tym modalu** — oba tryby non-streaming (decyzja użytkownika). Dotychczasowy `streamChat`/`sse.ts` i `/api/ai/chat` **zostają nietknięte** (dalej używa ich konwersacyjny `AiChat.tsx`).
- **Undo/preview przed nadpisaniem** — nadpisujemy wprost (odnotowane jako ryzyko utraty szkicu).
- Osobna lista/dropdown dostępnych modeli (w aplikacji model to free-text, zostawiamy free-text).
- **Regulacja głębokości web searchu** (`search_context_size`/suwak `low/medium/high`) — MVP używa stałego `plugins:[{id:"web", max_results:5}]`.
- **Osobna sekcja „Źródła" / renderowanie `annotations`** — MVP polega na tym, że model wstawi linki markdown w treści (domyślny `search_prompt`).
- Zapamiętywanie ostatnich ustawień modala między sesjami.
- Zmiany w `AiChat.tsx`, `src/lib/sse.ts`, `/api/ai/chat/route.ts` (poza featurem — bez zmian).

## Podejście

> Reguła z `AGENTS.md` sprawdzona: to Next.js **16.2.10**. Route handlery (`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`) używają Web `Request`/`Response`, sterują cache przez route config, a długim czasem wykonania przez `export const maxDuration` (jak w istniejącym `src/app/api/ai/chat/route.ts`, gdzie `maxDuration = 300`). Nie zakładamy żadnego nowego API.

**1. Jeden endpoint non-streaming dla obu trybów (decyzja użytkownika):**

- `POST /api/ai/analyze` przyjmuje `{ mode: "fill" | "generate", draft?: string, companyId?: number|null, webSearch?: boolean, model?: string, instructions?: string }` i zwraca JSON `{ content }`.
  - **`mode: "fill"`** (Uzupełnij szkic): `user` = `FILL_DRAFT_INSTRUCTION` + `draft` (+ `instructions`). Spółka opcjonalna → jeśli `companyId`, kontekst doklejany do systemu. Klient **nadpisuje** `content` wynikiem.
  - **`mode: "generate"`** (Wygeneruj od zera): **wymaga `companyId`** (400, gdy brak). `user` = `AI_RESEARCH_PROMPT` (przeniesiony z `NoteEditor`, np. do `src/lib/ai.ts`) (+ `instructions`); kontekst spółki w systemie. Klient **dokleja** wynik po nagłówku `---` (nagłówek buduje klient jak dziś).
- Klient (`AiAnalyzeModal` + `NoteEditor`) robi zwykły `fetch`, `await res.json()`, obsługuje błędy (502/400 → komunikat w modalu, NIE nadpisuje pustką). Brak `streamChat` w tej ścieżce.

**2. DRY na warstwie `src/lib/ai.ts`, nie na warstwie route:** logikę web-plugin/model-override i budowę body OpenRoutera trzymamy w `openrouterChat`/helperze w `src/lib/ai.ts`; route tylko składa `system`/`user` i woła helper. Reużywamy `buildCompanyContext`, `SYSTEM_PROMPT`, `getAiConfig`.

**3. Format requestu web search (zweryfikowany na https://openrouter.ai/docs/features/web-search):**

Do body OpenRoutera (obok `model`, `messages`, `stream:false`) dodajemy tablicę `plugins`:

```jsonc
{
  "model": "anthropic/claude-sonnet-4.5",
  "messages": [ /* ... */ ],
  "stream": false,
  "plugins": [
    { "id": "web", "max_results": 5 }   // id DOSŁOWNIE "web"; max_results domyślnie 5
  ]
}
```

- **`id` = `"web"`** (dosłownie ten string) — potwierdzone.
- **`max_results`** — MVP stałe `5`.
- **`engine`** (opcjonalny) — domyślnie `"native"` (jeśli provider wspiera), fallback `"exa"`. Nie ustawiamy.
- **`search_prompt`** (opcjonalny) — domyślnie zawiera aktualną datę + instrukcję cytowania linkami markdown. Nie nadpisujemy.
- **`web_search_options.search_context_size`** — osobny parametr natywnego searchu; **nie dodajemy** w MVP.
- **Skrót `:online`** (sufiks do slug modelu) jest równoważny `plugins:[{id:"web"}]`. **Wybieramy jawne `plugins`** (czytelniejsze, nie mieszamy z override'em modelu).
- **Koszt:** exa ~**$0.005/request** (do 10 wyników). Web search **dolicza koszt nawet przy darmowych modelach** — pokazać krótką notkę „może zwiększyć koszt" przy checkboxie; nie włączać domyślnie.
- **Wzmocnienie w system prompt:** gdy web search włączony, doklejamy do systemu zdanie w stylu: _„Masz dostęp do web searchu — użyj go, aby zweryfikować bieżące fakty (kursy, newsy, wyniki) i cytuj źródła linkami markdown."_ (wymóg użytkownika: plugin + instrukcja w promptcie).

**4. Prompt do „Uzupełnij szkic":** nowa stała/funkcja w `src/lib/ai.ts` (np. `FILL_DRAFT_INSTRUCTION`) — instrukcja: _„Poniżej szkic notatki użytkownika (markdown, może zawierać szablon z pustymi sekcjami). Uzupełnij i dokończ go: wypełnij puste sekcje, zachowaj istniejącą treść i strukturę nagłówków, nie dodawaj komentarzy poza treścią notatki. Zwróć KOMPLETNĄ notatkę w markdown — całość nadpisze bieżącą."_ Szkic idzie jako wiadomość `user`; kontekst spółki (jeśli jest) doklejany do systemu; „Dodatkowe instrukcje" doklejane na końcu promptu użytkownika.

## Pliki do zmiany

**Baza (warstwa danych):**

- `src/lib/ai.ts` — rozszerzyć `openrouterChat(messages, options)` o `options.model?: string` (override; fallback do `getAiConfig().model`) i `options.webSearch?: boolean` (→ dorzuca `plugins: [{ id: "web", max_results: 5 }]` do body; ewentualnie helper `buildWebPlugins`). Dodać eksporty: `FILL_DRAFT_INSTRUCTION` (prompt trybu „fill"), `AI_RESEARCH_PROMPT` (przeniesiony z `NoteEditor.tsx`), `webSearchSystemHint` (zdanie doklejane do systemu). Reużyć istniejące: `getAiConfig`, `buildCompanyContext`, `SYSTEM_PROMPT`, `getSetting`/`DEFAULT_MODEL` z `src/lib/settings.ts`. **Bez zmian w `src/db/schema.ts`** (ustawienia modala są efemeryczne, per request).

**API (warstwa API):**

- `src/app/api/ai/analyze/route.ts` — **NOWY** `POST`, non-streaming, `export const maxDuration = 300`. Body: `{ mode: "fill"|"generate", draft?: string, companyId?: number|null, webSearch?: boolean, model?: string, instructions?: string }`. Walidacja: `generate` bez `companyId` → 400; `fill` z pustym `draft` → 400. Buduje `system` (`SYSTEM_PROMPT` + `buildCompanyContext` gdy `companyId` + `webSearchSystemHint` gdy `webSearch`) i `user` (per tryb: `FILL_DRAFT_INSTRUCTION`+draft LUB `AI_RESEARCH_PROMPT`; + `instructions`). Woła `openrouterChat(msgs, { stream:false, model, webSearch })`, parsuje `body.choices[0].message.content`, brak treści → 502 z komunikatem. Zwraca `NextResponse.json({ content })`. Wzorzec: `src/app/api/ai/chat/route.ts` (walidacja, try/catch → 502) i `src/app/api/settings/route.ts`.
- `src/app/api/ai/chat/route.ts` — **BEZ ZMIAN** (dalej streamuje dla `AiChat.tsx`).

**UI (warstwa UI):**

- `src/components/AiAnalyzeModal.tsx` — **NOWY** komponent (client). Reużywa `Modal` z `src/components/Modal.tsx` oraz `Button`/`Label`/`Select`/`Input`/`Textarea` z `src/components/ui.tsx` (NIE pisać własnych pól). Zawartość: radio/segmented tryb (Uzupełnij szkic / Wygeneruj od zera), `Select` spółki (prefill z propsa; przy trybie „generate" wymagana — walidacja przed wysyłką), checkbox „Web search" (natywny `<input type=checkbox>` — brak komponentu Checkbox w `ui.tsx`) z notką o koszcie, `Textarea` „Dodatkowe instrukcje", `Input` „Model (opcjonalnie)" z placeholderem = model globalny, przyciski Anuluj/Uruchom (+ stan „Generuję…"). Props: aktualny `content`, `companyId` (i setter, jeśli modal ma pozwalać zmienić spółkę), lista `companies`, `defaultModel`, callbacki `onFillResult(text)` (nadpisz) i `onGenerateResult(text)` (doklej po `---`) — albo jeden `onResult(mode, text)`. **Mobile ~360–390 px:** wszystkie pola `w-full`, układ pionowy; `Modal` daje `p-4` + scroll. Wzorzec otwierania z przycisku: `src/components/TransactionEditButton.tsx`.
- `src/components/NoteEditor.tsx` — podmienić przycisk „✦ Generuj analizę AI" na przycisk otwierający `AiAnalyzeModal` (stan `aiModalOpen`). Usunąć zależność od `streamChat`/`generateAi` streamingu; zamiast tego: tryb `fill` → `setContent(text)` (nadpisanie); tryb `generate` → doklejenie nagłówka `---` + `setContent(prev + header + text)`. `AI_RESEARCH_PROMPT` przenieść do `src/lib/ai.ts` (lub zostawić po stronie serwera — klient nie musi go znać). Przekazać `defaultModel` do modala.
- `src/app/research/new/page.tsx` **oraz** `src/app/research/[id]/page.tsx` — dostarczyć do `NoteEditor` nowy prop `defaultModel` (np. `getAiConfig().model` lub `getSetting(SETTING_KEYS.openrouterModel) || DEFAULT_MODEL`) do prefill/placeholder override'u modelu. Uwaga: `[id]/page.tsx` dziś nie przekazuje `templates` — dla modala bez znaczenia, ale `defaultModel` trzeba dodać w obu miejscach.
- `src/lib/sse.ts` — **BEZ ZMIAN** (nieużywany w tej ścieżce; zostaje dla `AiChat.tsx`).

## Kryteria akceptacji

- [ ] Na nowej i istniejącej notatce jest przycisk otwierający modal „Analiza AI".
- [ ] Tryb „Uzupełnij szkic": wpisuję/wklejam szablon, klikam Uruchom → po chwili treść notatki zostaje **nadpisana** uzupełnioną wersją; modal się zamyka. (Bez spółki też działa.)
- [ ] Tryb „Wygeneruj od zera": **wymaga spółki** (bez niej — czytelna blokada/komunikat), po uruchomieniu **dokleja** analizę po `---`.
- [ ] Oba tryby non-streaming: podczas generowania widoczny stan „Generuję…", przycisk zablokowany; treść pojawia się w całości po zakończeniu.
- [ ] Checkbox „Web search" włączony → request do OpenRoutera zawiera `plugins:[{id:"web",...}]`, a system prompt instrukcję o web searchu (zweryfikować w `preview_network`/logach, że body ma `plugins`).
- [ ] Override modelu działa: wpisany model nadpisuje globalny tylko dla tej analizy; pusty → model globalny.
- [ ] „Dodatkowe instrukcje" trafiają do promptu.
- [ ] Błąd AI (502/refusal/brak treści) → komunikat w modalu, notatka NIE zostaje nadpisana pustką.
- [ ] Modal czytelny i obsługiwalny na ~360–390 px (pola full-width, scroll, brak poziomego scrolla).
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się i oba tryby działają w preview.

## Ryzyka

- **Utrata szkicu przy nadpisaniu** — tryb „Uzupełnij szkic" nadpisuje `content` bez undo/preview (świadoma decyzja). Mitigacja minimalna: nadpisanie działa na stanie React (niezapisana notatka), reload przywraca ostatnią zapisaną wersję; rozważyć przechowanie poprzedniej treści w ref pod ewentualne „Cofnij" (poza MVP).
- **Ślepe czekanie (non-streaming) + timeout** — oba tryby czekają na całość bez podglądu; web search + pełna notatka mogą się zbliżyć do limitu. `openrouterChat` ma dziś `AbortSignal.timeout(120000)`; rozważyć podniesienie do ~180 s przy `maxDuration = 300`. Wyraźny stan „Generuję…", żeby użytkownik nie myślał, że zawisło.
- **Koszt web searchu** — dolicza się nawet przy darmowych modelach (exa ~$0.005/request). Notka w UI; nie włączać domyślnie.
- **Format `plugins` / zmiany API OpenRoutera** — zweryfikowany na dokumentacji (id `"web"`, `max_results` 5). Gdyby provider nie wspierał natywnie, exa jest fallbackiem.
- **Parsowanie odpowiedzi non-streaming** — obsłużyć brak `choices[0].message.content` (błąd/refusal) → czytelny komunikat, nie nadpisywać notatki pustką.

## Pytania do doprecyzowania

_Wszystkie rozstrzygnięte (rundy pytań `/plan-feature`):_
- Transport: **jeden endpoint non-streaming** `/api/ai/analyze` dla obu trybów (bez streamingu). ✔
- „Wygeneruj od zera" **wymaga spółki**. ✔
- Głębokość web search: **MVP stałe `max_results:5`**, bez suwaka. ✔
- Źródła: **linki markdown w treści** (domyślny `search_prompt`), bez osobnej sekcji/`annotations`. ✔
