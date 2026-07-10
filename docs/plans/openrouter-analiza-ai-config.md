# Konfiguracja generowania analizy AI — temperature / top_p / reasoning + koszt (usage)

> Plan wygenerowany przez skill `/plan-feature`. Slug: `openrouter-analiza-ai-config`. Branch: `feature/openrouter-analiza-ai-config`.

## Kontekst / Problem

Modal „Analiza AI" (`src/components/AiAnalyzeModal.tsx`) + endpoint non-streaming `POST /api/ai/analyze` pozwalają dziś nadpisać per-uruchomienie tylko dwa parametry generowania: `model` i `webSearch` (reszta body OpenRoutera jest sztywna). Wartość domyślna modelu żyje w Ustawieniach (`AiSettingsForm` → klucz `openrouter_model`), a modal robi override na jedną analizę — to sprawdzony, powielalny wzorzec (patrz `docs/plans/ai-analiza-notatki.md`).

Użytkownik chce sterować jakością i charakterem analizy oraz widzieć jej koszt:
1. **Temperature / top_p** — rzeczowość vs kreatywność odpowiedzi.
2. **Reasoning effort** — głębokość „myślenia" modelu (szybka vs dogłębna analiza).
3. **Koszt + tokeny** wygenerowanej analizy pokazane w modalu po zakończeniu (usage accounting OpenRoutera).

Każdy z parametrów (1) i (2) ma mieć **wartość domyślną w Ustawieniach** ORAZ **override per analiza** w modalu — dokładnie jak dziś `model`/`webSearch`. Punkt (3) to tylko odczyt/prezentacja pola `usage` z odpowiedzi.

## Wymagania

**Funkcjonalne:**
- W Ustawieniach (`AiSettingsForm`, karta „AI — OpenRouter") dochodzą pola: **Temperature**, **Top P**, **Reasoning effort** (globalne domyślne). Puste pole = „nie wysyłaj parametru, użyj domyślnej modelu".
- W modalu „Analiza AI" dochodzą te same trzy pola jako **override per uruchomienie**; puste → używana wartość globalna z Ustawień (placeholder pokazuje wartość globalną, jak dziś dla modelu).
- Po zakończeniu analizy modal pokazuje **koszt** (USD credits) i **liczbę tokenów** (w tym reasoning tokens, gdy są) — z pola `usage` odpowiedzi OpenRoutera.
- Efektywna wartość każdego parametru: `override z modalu ?? domyślna z Ustawień ?? pominięcie parametru` (fallback rozstrzygany centralnie w `openrouterChat`, tak jak dziś dla `model`).
- Walidacja zakresów: temperature `0–2`, top_p `0–1`, reasoning effort ∈ `{low, medium, high}`.

**Niefunkcjonalne:**
- Nowe pola w modalu i w formularzu Ustawień responsywne na ~360–390 px (wymóg `AGENTS.md`): pola `w-full`, temperature/top_p obok siebie tylko od `sm:` (`grid-cols-1 sm:grid-cols-2`), pionowy stack na mobile, brak poziomego scrolla.
- Zmiany tylko w ścieżce **non-streaming** `/api/ai/analyze`. Streamingowy czat (`AiChat.tsx`, `/api/ai/chat`, `src/lib/sse.ts`) nietknięty.
- Klucze ustawień w prostej tabeli k-v `settings` — bez migracji.

## Zakres i Non-goals

**W zakresie:**
- `temperature`, `top_p`, `reasoning: { effort }` — domyślne w Ustawieniach + override w modalu.
- Odczyt `usage` (koszt, tokeny) z odpowiedzi non-streaming — zawsze automatycznie dołączane przez OpenRouter, bez dodatkowego parametru w body — i jego prezentacja w `AiAnalyzeModal`.
- Rozszerzenie istniejących: `openrouterChat`/`getAiConfig` (`src/lib/ai.ts`), `SETTING_KEYS` (`src/lib/settings.ts`), `AiSettingsForm`, `settings/page.tsx`, `/api/settings`, `/api/ai/analyze`, `AiAnalyzeModal`, `NoteEditor`, obie strony `research/*`.

**Non-goals (świadomie pomijamy):**
- `max_tokens`, wariant `reasoning: { max_tokens }` i `reasoning.exclude` — tylko `effort` (3 poziomy).
- models fallback array, provider preferences (ZDR/max_price/sort), `response_format`/structured outputs, prompt caching, message transforms, rozszerzenie pluginu web (domain filtering), `seed`, tool calling.
- Zmiany w `AiChat.tsx`, `/api/ai/chat`, `src/lib/sse.ts` (streaming). Usage accounting dla streamingu (wymaga parsowania końcowego chunku SSE) — poza zakresem.
- Osobna migracja schematu — tabela `settings` to k-v (`src/db/schema.ts` ~L172), nowe klucze dochodzą leniwie przez `setSetting`.
- Zapamiętywanie override'ów modala między sesjami (jak dziś dla model/webSearch — efemeryczne).

## Podejście

> Reguła z `AGENTS.md` („to NIE jest Next.js, który znasz"): feature **nie wprowadza żadnego nowego API Next.js**. Rozszerzamy istniejące route handlery `src/app/api/ai/analyze/route.ts` i `src/app/api/settings/route.ts`, które już używają dokładnie tych samych konstrukcji, co reszta repo: `NextRequest`/`NextResponse.json(...)`, `export const maxDuration = 300`. Kopiujemy 1:1 istniejący wzorzec — nie zakładamy nic nowego. (Uwaga wykonawcza: w tym środowisku `node_modules/` nie jest zainstalowane, więc `node_modules/next/dist/docs/` nie dało się przeczytać na żywo; wzorce potwierdzone przez działający kod w repo oraz plan `docs/plans/ai-analiza-notatki.md`. Implementator z zależnościami POWINIEN zerknąć do przewodnika route-handlers, jeśli będzie modyfikował coś poza kopiowaniem istniejącego wzorca.)

**1. Fallback rozstrzygany w `openrouterChat` (DRY, jak dla `model`).**
`openrouterChat` już dziś czyta `getAiConfig()` i robi `options.model?.trim() || defaultModel`. Powielamy tę samą mechanikę dla nowych parametrów: `getAiConfig()` zwraca też domyślne temperature/top_p/reasoning, a `openrouterChat` bierze `override ?? default` i dołącza pole do body tylko gdy nie-null (spread warunkowy jak dziś `...(plugins ? { plugins } : {})`). Dzięki temu route pozostaje cienki, a logika „co wysłać do OpenRoutera" jest w jednym miejscu.

**2. Reasoning — tylko `effort` (3 poziomy).**
Nowy helper `buildReasoning(effort?)` w `src/lib/ai.ts`, **wzorowany 1:1 na istniejącym `buildWebPlugins`** (`src/lib/ai.ts` L144): zwraca `{ effort } | undefined`. Body: `...(reasoning ? { reasoning } : {})`. Najprostszy, model-agnostyczny wariant (OpenRouter mapuje `effort` na styl danego modelu). Zgodnie z researchem OpenRouter zwykle ignoruje nieobsługiwane pola reasoning zamiast rzucać błędem — ale to do potwierdzenia w teście manualnym (patrz Ryzyka).

**3. Usage accounting — czysty odczyt, bez dodatkowego parametru.**
Zweryfikowane na żywo (WebSearch, dokumentacja OpenRoutera „Usage Accounting"): `usage: { include: true }` i `stream_options: { include_usage: true }` są **deprecated i nie mają efektu** — pełne dane `usage` (w tym `usage.cost`, `usage.cost_details`) są **zawsze automatycznie dołączane** do każdej odpowiedzi non-streaming. Nie trzeba więc niczego dokładać do body. `openrouterChat` **nadal zwraca surowy `Response`** (kontrakt bez zmian); route non-streoing robi jak dziś `await upstream.json()` i wyciąga z `data.usage` koszt/tokeny, po czym zwraca je w JSON obok `content`. Streaming (`/api/ai/chat`) bez zmian.

**4. Wartości domyślne = „puste".**
W k-v `settings` przechowujemy string; **pusty string = „nie wysyłaj parametru" (domyślna modelu)**. Analogicznie w modalu puste pole = użyj globalnej. To najmniej inwazyjne (żadnych magicznych liczb narzuconych użytkownikowi) — konkretne wartości startowe do doprecyzowania (patrz Pytania).

**5. Prezentacja kosztu wymaga „modal zostaje otwarty po sukcesie".**
Dziś `AiAnalyzeModal.run()` po sukcesie od razu woła `onClose()` (`AiAnalyzeModal.tsx` L88) — modal znika, więc nie ma gdzie pokazać kosztu. Zmiana UX: po sukcesie **nie zamykamy automatycznie**; wynik (fill/generate) nadal aplikujemy do notatki natychmiast (`onFillResult`/`onGenerateResult`), ale modal zostaje z panelem „Analiza gotowa — koszt / tokeny" i przyciskiem **Zamknij**. Odrzucona alternatywa: toast/pasek w `NoteEditor` po zamknięciu — gorszy, bo koszt gubi się przy natychmiastowym zamknięciu i wymaga dodatkowego kanału stanu.

## Pliki do zmiany

**Baza (warstwa danych):**

- `src/lib/settings.ts` — do `SETTING_KEYS` dodać `aiTemperature: "ai_temperature"`, `aiTopP: "ai_top_p"`, `aiReasoningEffort: "ai_reasoning_effort"`. Dodać stałe domyślnych startowych (np. `DEFAULT_REASONING_EFFORT`, ew. `DEFAULT_TEMPERATURE`/`DEFAULT_TOP_P` — wartości do potwierdzenia, patrz Pytania). Reużyć istniejące `getSetting`/`setSetting`. **Bez zmian w `src/db/schema.ts`** — tabela `settings` to k-v (`key` PK, `value`), potwierdzone L172–175; nowe klucze wchodzą leniwie.
- `src/lib/ai.ts` — trzy zmiany, wszystkie na wzorcach już obecnych w pliku:
  - `getAiConfig()` — rozszerzyć zwracany obiekt o `temperature: number | null`, `topP: number | null`, `reasoningEffort: "low"|"medium"|"high"|null` (parsowane z nowych kluczy; pusty/niepoprawny → `null`). Additive — istniejący `{ apiKey, model }` bez zmian dla dotychczasowych callerów.
  - Nowy helper `buildReasoning(effort?)` — **kopia wzorca `buildWebPlugins`** (L144): `effort ? { effort } : undefined`.
  - `openrouterChat(messages, options)` — do `options` dołożyć `temperature?: number`, `topP?: number`, `reasoning?: "low"|"medium"|"high"`. Wewnątrz: `const cfg = getAiConfig()` (już jest); efektywne `temperature = options.temperature ?? cfg.temperature`, `topP = options.topP ?? cfg.topP`, `reasoningEffort = options.reasoning ?? cfg.reasoningEffort`. W `body` dołożyć spready warunkowe w stylu istniejącego `...(plugins ? { plugins } : {})`: `...(temperature != null ? { temperature } : {})`, `...(topP != null ? { top_p: topP } : {})`, `...(buildReasoning(reasoningEffort) ? { reasoning: buildReasoning(reasoningEffort) } : {})`. Bez żadnego `usage`-parametru w body — OpenRouter zawsze zwraca `usage` (patrz Podejście pkt 3). **Zwracany typ bez zmian** (`Response`).

**API (warstwa API):**

- `src/app/api/ai/analyze/route.ts` — (wzorzec walidacji: `src/app/api/settings/route.ts`; struktura: obecny plik):
  - Sparsować z body: `temperature`, `topP` (liczby lub `undefined`), `reasoningEffort` (string albo `undefined`). Walidacja: temperature poza `0–2` / top_p poza `0–1` / effort spoza `{low,medium,high}` → `400` (albo pominięcie pojedynczego pola — decyzja jak w Pytaniach; rekomendacja: 400 z czytelnym komunikatem, spójnie z walidacją cron w settings route).
  - Przekazać do `openrouterChat(msgs, { stream: false, model, webSearch, temperature, topP, reasoning: reasoningEffort })`.
  - Po `const data = await upstream.json()` (już jest) wyciągnąć `usage`: `{ cost: data?.usage?.cost, totalTokens: data?.usage?.total_tokens, promptTokens: data?.usage?.prompt_tokens, completionTokens: data?.usage?.completion_tokens, reasoningTokens: data?.usage?.completion_tokens_details?.reasoning_tokens }` (defensywnie, każde pole może być `undefined`). Zwrócić `NextResponse.json({ content, usage })`.
- `src/app/api/settings/route.ts` — (wzorzec: obecny plik):
  - `GET` — dołożyć do zwracanego JSON `temperature`, `topP`, `reasoningEffort` (odczyt z nowych kluczy; pusty → `""`).
  - `POST` — przyjąć i zapisać nowe pola. Puste = wyczyść (`setSetting(key, "")`) — jak istniejący pattern `benchmarkCompanyId` (L68–78). Niepusta wartość musi przejść walidację zakresu (jak cron `if (trimmed && !valid) → 400`), inaczej `400` i nic nie zapisujemy.

**UI (warstwa UI):**

- `src/components/AiSettingsForm.tsx` — reużyć `Input`/`Select`/`Label`/`Button` z `src/components/ui.tsx` (nie pisać własnych pól; `Input` przepuszcza `type="number"`, `min`, `max`, `step` — potwierdzone L161). Nowe propsy `temperature`, `topP`, `reasoningEffort` (stringi z page). Pola: Temperature (`Input type="number" min={0} max={2} step={0.1}`), Top P (`Input type="number" min={0} max={1} step={0.05}`), Reasoning effort (`Select`: opcje `""` = „Domyślne modelu", `low` = „Niska (szybciej)", `medium` = „Średnia", `high` = „Wysoka (dogłębnie)"). Dorzucić do `payload` w `save()`. **Mobile ~360–390 px:** kontener już `max-w-xl space-y-3`, `Input` jest `w-full` → pionowy stack działa out-of-the-box; temperature+top_p ewentualnie `grid grid-cols-1 sm:grid-cols-2 gap-3`. Krótkie `<p className="text-[11px] text-muted">` z wyjaśnieniem każdego pola.
- `src/app/settings/page.tsx` — odczytać trzy nowe ustawienia (`getSetting(SETTING_KEYS.aiTemperature) ?? ""` itd.) i przekazać do `AiSettingsForm` (obok istniejących `model`/`hasApiKey`/`apiKeyPreview`).
- `src/components/AiAnalyzeModal.tsx` — reużyć `Input`/`Select`/`Label` z `ui.tsx`. Dodać:
  - Stan `temperature`, `topP` (stringi, puste = użyj globalnej), `reasoningEffort` (string, `""` = globalna).
  - Nowe propsy `defaultTemperature`, `defaultTopP`, `defaultReasoningEffort` (do placeholderów, jak dziś `defaultModel` → placeholder pola „Model").
  - Pola override: Temperature + Top P w `grid grid-cols-1 sm:grid-cols-2 gap-3` (stack na mobile), Reasoning effort `Select` (`""` = „Domyślne (globalne)" + 3 poziomy), wszystko `w-full`. Placeholdery pokazują wartość globalną.
  - W `run()` do body `fetch` dołożyć `temperature: temperature.trim() ? Number(temperature) : undefined`, `topP: …`, `reasoningEffort: reasoningEffort || undefined`.
  - **Prezentacja kosztu:** po sukcesie odczytać `data.usage`, zapisać do stanu `usage`; **nie wołać `onClose()` automatycznie** — zamiast tego pokazać panel „Analiza gotowa" z kosztem/tokenami i zmienić przycisk na **Zamknij** (ręczne `onClose()`); wynik do notatki aplikować od razu (`onFillResult`/`onGenerateResult` bez zmian). Format: jedna linia tekstu `Koszt: $0.0042 · 3 210 tokenów`, z atrybutem `title` (natywny tooltip przeglądarki na hover) zawierającym rozbicie — prompt/completion tokens, reasoning tokens (jeśli obecne), `cost_details` (upstream/cache discount, jeśli obecne); pola nieobecne w `usage` — pomijamy zarówno z linii, jak i z tooltipa. **Mobile:** panel to `w-full` tekst `text-[12px]`, pełna szerokość; natywny `title` tooltip nie działa na tap (mobile), więc linia tekstu sama w sobie musi nieść kluczową informację (koszt + suma tokenów), a tooltip jest tylko bonusem na desktopie.
- `src/components/NoteEditor.tsx` — przyjąć nowe propsy `defaultTemperature`, `defaultTopP`, `defaultReasoningEffort` i przekazać do `AiAnalyzeModal` (obok istniejącego `defaultModel`). Bez innej logiki.
- `src/app/research/new/page.tsx` **oraz** `src/app/research/[id]/page.tsx` — oba już robią `const { model: defaultModel } = getAiConfig()`; rozszerzyć destrukturyzację o `temperature`, `topP`, `reasoningEffort` z rozszerzonego `getAiConfig()` i przekazać do `NoteEditor` jako `defaultTemperature`/`defaultTopP`/`defaultReasoningEffort` (skonwertowane do stringów dla placeholderów).
- `src/components/AiChat.tsx`, `src/lib/sse.ts`, `src/app/api/ai/chat/route.ts` — **BEZ ZMIAN** (streaming poza zakresem).

## Kryteria akceptacji

- [ ] W Ustawieniach → „AI — OpenRouter" są pola Temperature, Top P, Reasoning effort; zapis działa, wartości utrzymują się po `router.refresh()`.
- [ ] Puste globalne pole = brak parametru w body OpenRoutera (weryfikacja w logach/preview_network: body bez `temperature`/`top_p`/`reasoning`).
- [ ] W modalu „Analiza AI" są te same trzy pola override; placeholder pokazuje wartość globalną; pusty override → użyta globalna, niepusty → nadpisuje na tę jedną analizę (weryfikacja w body requestu).
- [ ] Reasoning effort `high` vs `low` daje obserwowalnie różną głębokość/tokeny; body zawiera `reasoning: { effort: … }`.
- [ ] Po zakończeniu analizy modal pokazuje koszt i liczbę tokenów (gdy `usage` obecne w odpowiedzi); modal NIE zamyka się sam, jest przycisk „Zamknij"; wynik jest już zaaplikowany do notatki.
- [ ] Walidacja zakresów: temperature spoza 0–2 / top_p spoza 0–1 / zły effort → czytelny błąd (400 z komunikatem), notatka nie zostaje ruszona.
- [ ] Nowe pola czytelne i obsługiwalne na ~360–390 px (full-width, pionowy stack, brak poziomego scrolla) — zweryfikowane w przeglądarce.
- [ ] Streaming (`AiChat`) działa jak wcześniej — brak regresji (nie wysyła `usage`, nie łamie się na nowych opcjach `openrouterChat`).
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się; oba tryby analizy działają z override'ami i pokazują koszt w preview.

## Ryzyka

- **Kształt `reasoning`/`usage` zweryfikowany przez WebSearch, nie przez oficjalny WebFetch (docs blokują boty, HTTP 403).** Potwierdzone: `usage.cost`/`usage.cost_details` zawsze obecne automatycznie w non-streaming (parametr `usage.include` deprecated, bez efektu); `reasoning: { effort }` przyjmuje m.in. `low`/`medium`/`high` (OpenRouter wspiera też `xhigh`/`minimal`/`none`, świadomie pomijane — non-goal). Nazwy pól tokenów (`total_tokens`, `completion_tokens_details.reasoning_tokens`) do potwierdzenia dokładnie w teście manualnym (podgląd odpowiedzi w preview_network) — kod ma być defensywny (każde pole `usage` opcjonalne).
- **Reasoning na modelach bez wsparcia.** Część modeli może silently dropować reasoning tokens albo (rzadziej) zwrócić błąd na nieznane pole. Mitygacja: `reasoning` wysyłane tylko gdy effort ustawiony; przy błędzie route zwraca 502 z komunikatem (istniejący `try/catch`), notatka nietknięta.
- **Koszt bywa `0` lub `null`** dla części providerów/darmowych modeli. UI musi chować pola nieobecne/zerowe, a nie pokazywać „$0" jako błąd.
- **Zmiana UX „modal zostaje otwarty".** Modyfikacja obecnego auto-`onClose()` — upewnić się, że stan `usage`/`error` czyści się przy ponownym otwarciu i przy zmianie trybu, żeby nie pokazać starego kosztu.
- **`node_modules` niezainstalowane w środowisku planowania** — nie dało się przeczytać `node_modules/next/dist/docs/` na żywo (reguła `AGENTS.md`). Feature nie dodaje nowego API Next.js (kopiuje istniejące route handlery), więc ryzyko niskie; implementator z zależnościami niech zerknie do przewodnika, jeśli wyjdzie poza kopiowanie wzorca.
- **Spójność typów `getAiConfig()`.** Rozszerzenie zwracanego obiektu jest additive, ale sprawdzić wszystkich callerów (`/api/ai/chat`, `research/*`, `settings/page`) czy destrukturyzacja nadal się kompiluje (`npm run build`).

## Pytania do doprecyzowania

_Wszystkie rozstrzygnięte (runda pytań `/plan-feature`):_
- Startowe wartości domyślne temperature/top_p/reasoning effort w Ustawieniach: **puste** (= nie wysyłamy parametru, model używa swojej domyślnej). ✔
- Format prezentacji kosztu: **jedna linia tekstu** „Koszt: $X · N tokenów" w modalu, **plus `title`/tooltip przy najechaniu** z rozbiciem (prompt/completion/reasoning tokens, `cost_details` jeśli obecne). ✔
- Walidacja out-of-range (temperature poza 0–2, top_p poza 0–1): **twardy błąd 400** z czytelnym komunikatem, spójnie z walidacją cron w `/api/settings`. ✔
- `usage.include`: **niepotrzebne** — potwierdzone (deprecated, `usage` zawsze dołączane automatycznie). ✔ (patrz Podejście pkt 3, Ryzyka)
- Reasoning: tylko `effort` (`low`/`medium`/`high`), bez wariantu `{ max_tokens }` — potwierdzony non-goal. ✔
- Rozszerzenie na streaming (`AiChat`/`/api/ai/chat`): **poza zakresem tego featurea** (non-goal, decyzja użytkownika sprzed planowania). Możliwy osobny follow-up w przyszłości — nieplanowany tu.
