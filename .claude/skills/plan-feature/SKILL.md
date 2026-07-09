---
name: plan-feature
description: Prowadzi nowy feature od pomysłu do PR — pytania doprecyzowujące, subagent Opus planujący do docs/plans/, runda pytań, subagent Sonnet implementujący, weryfikacja (lint+build+preview), commit i PR. Użyj gdy użytkownik uruchomi /plan-feature.
argument-hint: <krótki opis featurea>
disable-model-invocation: true
---

# plan-feature

Orkiestruje pełny cykl nowego featurea: doprecyzowanie → planowanie (Opus) → runda pytań → implementacja (Sonnet) → weryfikacja → commit + PR. Opis featurea przychodzi w `$ARGUMENTS`.

Ten skill działa poza trybem plan (normalna sesja) — wolno edytować pliki, uruchamiać git i subagenty. Prowadź listę zadań (TaskCreate/TaskUpdate), żeby użytkownik widział postęp przez wszystkie fazy.

Dwie twarde bramki akceptacji są obowiązkowe: **BRAMKA 1** przed implementacją i **BRAMKA 2** przed commitem. Nie przekraczaj ich bez jawnej zgody użytkownika.

## Reguła projektu (bezwzględna)

`AGENTS.md` mówi: to NIE jest Next.js, który znasz z treningu — API, konwencje i struktura plików mogą się różnić. Zanim ktokolwiek (planer, implementer, Ty) założy jakiekolwiek API Next.js, MUSI przeczytać odpowiedni przewodnik w `node_modules/next/dist/docs/`. Wpisz ten wymóg do promptów obu subagentów.

## Krok 1 — Preconditions

1. Uruchom `git status`. Jeśli drzewo robocze jest brudne, zapytaj użytkownika (AskUserQuestion), czy: kontynuować mimo to, zrobić stash, czy przerwać. Nie commituj cudzych zmian.
2. Ustal branch bazowy — domyślnie `main`. Jeśli aktualny branch to nie `main`, potwierdź z użytkownikiem, z czego branchować.
3. Z `$ARGUMENTS` wyprowadź `<slug>` w kebab-case (np. „Alerty cenowe email" → `alerty-cenowe-email`). Slug używasz w nazwie pliku planu i brancha.

## Krok 2 — Pytania doprecyzowujące

Zadaj użytkownikowi 3–5 pytań przez `AskUserQuestion`, celując w to, co realnie zmienia kształt implementacji:
- zakres i **non-goals** (co świadomie pomijamy),
- UX / gdzie w aplikacji feature żyje,
- źródła danych (uwaga na pułapki Yahoo/Stooq/Bankier RSS z pamięci projektu, jeśli dotyczy),
- edge-case'y i stany błędów.

Nie pytaj o rzeczy, które łatwo ustalić z kodu — od tego jest planer w kroku 3.

## Krok 3 — Subagent-planer (Opus)

Uruchom `Agent` z `subagent_type: general-purpose`, `model: opus`. W prompcie przekaż: opis featurea z `$ARGUMENTS`, odpowiedzi z kroku 2, ścieżkę szablonu `references/plan-template.md` (względem katalogu tego skilla) oraz zadania:

1. **Najpierw eksploruj kod** — znajdź istniejące wzorce, komponenty i utility, które trzeba reużyć zamiast pisać od zera. Przeczytaj `AGENTS.md` i `CLAUDE.md`. Przed założeniem jakiegokolwiek API Next.js przeczytaj właściwy plik w `node_modules/next/dist/docs/`.
2. **Napisz plan** ściśle wg sekcji z `references/plan-template.md` i zapisz go do `docs/plans/<slug>.md`. W sekcji „Pliki do zmiany" wskaż konkretne ścieżki i istniejące utility do reużycia.
3. Zakończ plik sekcją `## Pytania do doprecyzowania` — otwarte pytania do użytkownika o feature lub implementację.
4. Zwróć ścieżkę pliku planu i zwięzłe streszczenie (bez wklejania całego planu).

## Krok 4 — Runda pytań i aktualizacja planu

1. Przeczytaj `docs/plans/<slug>.md`, w szczególności sekcję `## Pytania do doprecyzowania`.
2. Zadaj te pytania użytkownikowi (`AskUserQuestion` albo zwykłym tekstem, jeśli otwarte).
3. **Ty (główny agent) edytujesz plik planu**: wpisz decyzje w odpowiednie sekcje, usuń rozwiązane pytania. Po tym kroku sekcja pytań powinna być pusta lub zawierać tylko świadomie odłożone kwestie.

## Krok 5 — BRAMKA 1 (zgoda na implementację)

Pokaż użytkownikowi zwięzłe podsumowanie finalnego planu i zapytaj wprost o zgodę na rozpoczęcie implementacji. **Nie idź dalej bez „tak".** Jeśli użytkownik chce zmian — nanieś je w pliku planu i zapytaj ponownie.

## Krok 6 — Branch

Utwórz i przełącz się na `feature/<slug>` z brancha bazowego (`git switch -c feature/<slug>`). Commit pliku planu może iść tutaj lub razem z implementacją.

## Krok 7 — Implementacja warstwowa (workflow)

Zamiast jednego implementera odpalasz **warstwowy orkiestrator** — implementacja idzie dane → API → UI, z przekazaniem strukturyzowanego kontekstu między warstwami (nazwy tabel/funkcji → endpointy → UI). To ten sam mechanizm co skill `/implement-feature`.

1. Z sekcji `## Pliki do zmiany` w `docs/plans/<slug>.md` wykryj obecne warstwy (`dane` = „Baza"/„Logika", `api` = „API", `ui` = „UI”); pomiń warstwy oznaczone `— brak —`.
2. Wywołaj narzędzie **`Workflow`** z `name: 'implement-layered'` (albo `scriptPath: '.claude/workflows/implement-layered.js'`) i `args: { planPath: 'docs/plans/<slug>.md', layers: [<wykryte>] }`. Wywołanie tego skilla jest ważnym opt-inem do Workflow — bez Ultracode i słowa-klucza.
3. Poczekaj na `<task-notification>`, odczytaj zwrócony `{ data, api, ui, verify }`. Workflow domyka lint/build w pętli; jeśli `verify` nie jest zielone, przejdź do kroku 8 z tymi błędami.

Fallback: dla bardzo małego featurea (jedna warstwa) możesz zamiast workflowa uruchomić pojedynczy `Agent` (`general-purpose`, `sonnet`) z tym samym promptem — przeczytaj plan + `AGENTS.md`/`CLAUDE.md` + docs Next.js, reużyj utility, zwróć listę zmian.

## Krok 8 — Weryfikacja (pętla)

Weryfikuj sam, nie proś użytkownika o ręczne sprawdzenie:
1. `npm run lint` — napraw błędy.
2. `npm run build` — to również typecheck; napraw błędy.
3. Odpal aplikację przez `preview_start`, przeładuj i sprawdź `preview_console_logs` / `preview_logs` / `preview_network`, potem `preview_snapshot` i `preview_screenshot`, żeby potwierdzić, że feature realnie działa.
4. Przy każdej porażce: deleguj poprawki do subagenta Sonnet (albo popraw sam, jeśli drobne) i **weryfikuj od nowa**, aż wszystko jest zielone.

## Krok 9 — BRAMKA 2 (zgoda na commit/PR)

Pokaż `git diff --stat` (lub kluczowe fragmenty diffu) oraz wynik weryfikacji z kroku 8. Zapytaj wprost o zgodę na commit i PR. Opcjonalnie zaproponuj `/code-review`. **Nie commituj bez „tak".**

## Krok 10 — Commit + PR

1. `git add` + `git commit`. Message w Conventional Commits, ostatnia linia:
   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```
2. `git push -u origin feature/<slug>`.
3. `gh pr create` — opis streszcza feature, kryteria akceptacji i **linkuje do `docs/plans/<slug>.md`**; ostatnia linia opisu:
   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```
4. Zwróć użytkownikowi URL PR-a jako link markdown.

## Zasady

- Modele przez parametr `model` toola `Agent`: planer `opus`, implementer `sonnet`.
- Subagentom przekazuj ścieżki i kontekst — nie zakładaj, że mają Twoją historię rozmowy.
- Skalowanie: dla drobnego featurea możesz połączyć kroki 2 i 4 w jedną rundę pytań; dla dużego podziel implementację na etapy w kroku 7.
