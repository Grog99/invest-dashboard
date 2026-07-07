# Harmonogram odświeżania (node-cron w procesie Next)

> Plan wygenerowany przez skill `/plan-feature`. Slug: `harmonogram-odswiezania-node-cron`. Branch: `feature/harmonogram-odswiezania-node-cron`.

## Kontekst / Problem

Dziś odświeżanie notowań i newsów jest **wyłącznie ręczne** — użytkownik klika przyciski
w `src/components/RefreshButtons.tsx`, które strzelają do `POST /api/quotes/refresh`
(`src/app/api/quotes/refresh/route.ts` → `refreshQuotes()`) oraz `POST /api/news/refresh`
(`src/app/api/news/refresh/route.ts` → `refreshNews()`). Dashboard nie aktualizuje się sam;
żeby zobaczyć świeże dane, trzeba wejść i kliknąć.

Roadmapa (`context/roadmap.md`, punkt 3.1, wariant **a**) przewiduje harmonogram w procesie Next:
`instrumentation.ts` uruchamiany raz przy starcie serwera rejestruje zadania cron, które
bezpośrednio wołają `refreshQuotes()` / `refreshNews()` z warstwy `src/lib`. To fundament pod
kolejne automatyzacje (alerty 3.2, raport AI 3.3, backupy 6.4). Aplikacja od lipca 2026 działa
24/7 w Dockerze (Coolify + Pangolin, `output: 'standalone'`), więc cron faktycznie chodzi całą dobę.

## Wymagania

**Funkcjonalne:**
- Zadania cron startują **raz na proces serwera** przy jego uruchomieniu (dev i produkcja/standalone),
  bez duplikowania przy HMR / hot-reload.
- Dwa niezależne zadania: notowania (`cron_quotes`) i newsy (`cron_news`), z osobnymi harmonogramami.
- Harmonogramy edytowalne z UI w `src/app/settings/page.tsx` (pełny panel), a nie tylko domyślne w kodzie/DB.
- Domyślne wartości: `cron_quotes = '*/15 9-17 * * 1-5'` (co 15 min, godziny sesji GPW, pn–pt),
  `cron_news = '*/30 * * * *'` (co 30 min, cały czas).
- Cron odświeża **wszystkie** spółki w bazie (bez filtra portfel/watchlist).
- Zmiana harmonogramu z UI ma być zastosowana bez restartu serwera (przeładowanie zadań).
- Możliwość **wyłączenia** danego zadania z UI.

**Niefunkcjonalne:**
- Błędy logowane do konsoli (parytet z dzisiejszym zachowaniem `refreshQuotes`/`refreshNews`, które
  zbierają błędy do `result.errors` — cron ma je wypisać do logu, nie wywalić procesu).
- Guard nakładania się uruchomień: gdy poprzedni przebieg tego samego zadania jeszcze trwa, kolejny
  tick jest pomijany. Guard w **pamięci procesu** (`isRunning` per job), **nie** w bazie.
- node-cron uruchamiany **wyłącznie w runtime Node.js** (nie Edge).
- Strefa czasowa zadań: `Europe/Warsaw` (kontener Dockera zwykle chodzi na UTC — bez tego
  `9-17` rozjedzie się z godzinami sesji GPW).

## Zakres i Non-goals

**W zakresie:**
- Nowy plik `src/instrumentation.ts` z `register()` (uwaga: **`src/`**, nie root — patrz Podejście).
- Nowy moduł `src/lib/scheduler.ts` (singleton `globalThis`, guardy `isRunning`, schedule + reload).
- Dodanie zależności `node-cron` (+ typy).
- Dwa nowe klucze w tabeli `settings`: `cron_quotes`, `cron_news` (bez nowej tabeli).
- Panel harmonogramu w `src/app/settings/page.tsx` + nowy komponent formularza + rozszerzenie
  `POST /api/settings` o zapis kluczy cron i wywołanie reloadu schedulera.
- Walidacja wyrażeń cron po stronie serwera (przez API node-cron).

**Non-goals (świadomie pomijamy):**
- Wariant (b) Windows Task Scheduler / `schtasks` — odrzucony w roadmapie na rzecz (a).
- Alerty (3.2), raport AI (3.3), backupy z crona (6.4) — osobne punkty roadmapy; ten plan tylko
  kładzie fundament (miejsce, w którym łatwo dołożyć kolejny job).
- Persistowanie historii przebiegów / status „ostatnie uruchomienie” w bazie (można dołożyć później;
  na teraz wystarczy log konsolowy).
- Rozproszony lock (np. wiele instancji serwera). Aplikacja to pojedynczy proces/kontener — guard
  w pamięci procesu wystarcza; przy skalowaniu horyzontalnym cron dublowałby się (poza zakresem).

## Podejście

**KLUCZOWE — zweryfikowane w `node_modules/next/dist/docs/` (zgodnie z regułą AGENTS.md):**

1. **Plik idzie do `src/instrumentation.ts`, NIE do roota.** Dokumentacja
   (`.../01-app/02-guides/instrumentation.md` oraz `.../03-api-reference/03-file-conventions/instrumentation.md`)
   mówi wprost: *„place the file in the root of your application or inside a `src` folder if using one”*
   i *„If you're using the `src` folder, then place the file inside `src` alongside `pages` and `app`.”*
   Ten projekt trzyma `app` w `src/app`, więc instrumentation musi być w `src/instrumentation.ts`.
   (To dokładnie ten typ różnicy, przed którym ostrzega AGENTS.md — treść zadania mówiła „katalog główny”,
   ale docs w tym repo mają pierwszeństwo.)

2. **`register()` woła się raz na start instancji serwera.** Docs: *„exports a `register` function that is
   called once when a new Next.js server instance is initiated, and must complete before the server is ready
   to handle requests. `register` can be an async function.”* Stabilne od Next `v15.0.0`
   (Version History w docs) — **żaden flag `experimental.instrumentationHook` nie jest potrzebny** w Next 16.2.10
   (potwierdzone: brak wzmianki o tym flagu w docs tego wydania).

3. **Runtime guard obowiązkowy.** Docs: *„Next.js calls `register` in all environments, so it's important to
   conditionally import any code that doesn't support specific runtimes.”* Wartości `process.env.NEXT_RUNTIME`
   to `'nodejs'` / `'edge'`. node-cron (natywne timery, brak edge-safe) ładujemy wyłącznie gdy
   `process.env.NEXT_RUNTIME === 'nodejs'`, przez **dynamiczny `await import()` wewnątrz `register()`**
   (wzorzec „Importing runtime-specific code” z docs) — dzięki temu moduł schedulera nigdy nie trafia
   do bundla edge.

**Singleton przez `globalThis` (kopia wzorca z `src/db/index.ts:239-245`).**
W dev Next re-importuje moduły przy HMR, a `register()` może się odpalić ponownie — bez guardu
dostalibyśmy zdublowane crony (dwa ticki na interwał). Stan schedulera (uchwyty zadań + flagi `isRunning`)
trzymamy na `globalThis.__investScheduler`, a `start()` jest idempotentne (jeśli `initialized`, nie robi nic).

**Reużycie logiki, zero duplikacji.** Cron woła bezpośrednio `refreshQuotes()` (`src/lib/quotes.ts`)
i `refreshNews()` (`src/lib/news.ts`) — te same funkcje, których używają route handlery. **Nie trzeba
żadnego refactora pod „wszystkie spółki”**: `refreshQuotes(companyIds?)` już domyślnie bierze wszystkie
spółki, gdy wywołane bez argumentu (`src/lib/quotes.ts:110-117` — filtruje tylko gdy `companyIds` niepuste).
`refreshNews()` i tak zawsze przetwarza wszystkie włączone źródła. Cron dla newsów powinien dodatkowo
wywołać `seedDefaultSourcesIfEmpty()` przed `refreshNews()` — parytet z `POST /api/news/refresh`
(`src/app/api/news/refresh/route.ts:5-6`).

**Konfiguracja w tabeli `settings` (nie nowa tabela).** Klucz-wartość idealnie pasuje do dwóch stringów cron;
istnieje gotowy helper `getSetting`/`setSetting`/`getAllSettings` (`src/lib/settings.ts`) i wzorzec `SETTING_KEYS`.
Nowa tabela byłaby nadmiarowa. Dodajemy `cron_quotes`, `cron_news` do `SETTING_KEYS` + stałe z domyślnymi wartościami.

**Włączanie/wyłączanie zadania — rekomendacja: pusty string = wyłączone** (spójne z konwencją
`quotes_auto_refresh_minutes` gdzie `0 = wyłączone`, roadmapa 1.4). Zaleta: brak drugiego ustawienia per job,
jedno pole w UI. Scheduler: jeśli wartość pusta/whitespace → zadanie nie jest planowane (i jest zatrzymywane
przy reloadzie). Walidacja niepustych wyrażeń przez API node-cron (`validate`). Pozostawiam otwarte
w „Pytania do doprecyzowania” na wypadek, gdyby użytkownik wolał osobny checkbox `enabled`.

**Przeładowanie bez restartu.** Po zapisie kluczy cron w `POST /api/settings` wołamy `reload()` schedulera
(stop starych zadań → odczyt nowych wartości → schedule). Import w route handlerze jest w runtime Node
(route handlery działają w Node.js domyślnie), więc `src/lib/scheduler.ts` można tam zaimportować bezpośrednio.

### Szkic kodu (dla ilustracji — dopracować przy implementacji)

`src/instrumentation.ts`:
```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
```

`src/lib/scheduler.ts` (wzorzec singletona jak `globalForDb` w `src/db/index.ts`):
```ts
import cron, { type ScheduledTask } from "node-cron";
import { getSetting, SETTING_KEYS, DEFAULT_CRON } from "./settings";
import { refreshQuotes } from "./quotes";
import { refreshNews, seedDefaultSourcesIfEmpty } from "./news";

type JobName = "quotes" | "news";
interface SchedulerState {
  tasks: Partial<Record<JobName, ScheduledTask>>;
  running: Partial<Record<JobName, boolean>>;
  initialized: boolean;
}
const g = globalThis as unknown as { __investScheduler?: SchedulerState };
const state: SchedulerState =
  g.__investScheduler ?? { tasks: {}, running: {}, initialized: false };
g.__investScheduler = state;

const TZ = "Europe/Warsaw";

async function runGuarded(name: JobName, fn: () => Promise<unknown>) {
  if (state.running[name]) {
    console.warn(`[scheduler] ${name}: poprzedni przebieg trwa — pomijam tick`);
    return;
  }
  state.running[name] = true;
  try {
    await fn();
  } catch (e) {
    console.error(`[scheduler] ${name} błąd:`, e);
  } finally {
    state.running[name] = false;
  }
}

function scheduleJob(name: JobName, expr: string, fn: () => Promise<unknown>) {
  state.tasks[name]?.stop(); // zatrzymaj poprzednie (reload)
  delete state.tasks[name];
  const trimmed = expr.trim();
  if (!trimmed || !cron.validate(trimmed)) return; // puste/niepoprawne = wyłączone
  state.tasks[name] = cron.schedule(
    trimmed,
    () => runGuarded(name, fn),
    { timezone: TZ }
  );
}

export function reloadScheduler() {
  scheduleJob(
    "quotes",
    getSetting(SETTING_KEYS.cronQuotes) ?? DEFAULT_CRON.quotes,
    () => refreshQuotes()
  );
  scheduleJob(
    "news",
    getSetting(SETTING_KEYS.cronNews) ?? DEFAULT_CRON.news,
    async () => {
      seedDefaultSourcesIfEmpty();
      return refreshNews();
    }
  );
}

export function startScheduler() {
  if (state.initialized) return; // idempotentne — chroni przed dublowaniem przy HMR
  state.initialized = true;
  reloadScheduler();
  console.log("[scheduler] wystartował");
}
```
> Uwaga: dokładne API node-cron (`schedule` / `validate` / `task.stop()` vs `task.destroy()`, kształt opcji
> `{ timezone }`) **zweryfikować po instalacji** wg zainstalowanej wersji — patrz Ryzyka. Powyższe odpowiada API v3.

## Pliki do zmiany

- **`package.json`** — dodać `node-cron` (pin **`^3.0.3`**, decyzja: v3 dla stabilności API) do `dependencies`
  oraz `@types/node-cron` do `devDependencies` (node-cron nie ma wbudowanych typów).
- **`src/instrumentation.ts`** *(nowy)* — `register()` z guardem `NEXT_RUNTIME === 'nodejs'` i dynamicznym
  importem `startScheduler`. **Lokalizacja `src/`, nie root** (bo projekt używa `src/app`).
- **`src/lib/scheduler.ts`** *(nowy)* — singleton `globalThis.__investScheduler`, `startScheduler()` (idempotentne),
  `reloadScheduler()`, guardy `isRunning` per job, strefa `Europe/Warsaw`, walidacja i „pusty = wyłączone”.
  Reużywa: `refreshQuotes` (`src/lib/quotes.ts`), `refreshNews` + `seedDefaultSourcesIfEmpty` (`src/lib/news.ts`),
  `getSetting` (`src/lib/settings.ts`).
- **`src/lib/settings.ts`** — dopisać do `SETTING_KEYS` klucze `cronQuotes: "cron_quotes"`, `cronNews: "cron_news"`
  oraz eksport `DEFAULT_CRON = { quotes: "*/15 9-17 * * 1-5", news: "*/30 * * * *" }`. Reużywa istniejących
  `getSetting`/`setSetting`.
- **`src/app/api/settings/route.ts`** — rozszerzyć `POST` o odczyt `body.cronQuotes` / `body.cronNews`:
  walidacja (pusty string dozwolony = wyłączenie; niepusty musi przejść `cron.validate` — zwróć 400 przy błędzie),
  zapis przez `setSetting`, na końcu `reloadScheduler()` (z `@/lib/scheduler`), żeby zmiana zadziałała bez restartu.
  Rozszerzyć `GET` o zwrot bieżących wartości `cron_quotes`/`cron_news` (dla prefill formularza).
- **`src/app/settings/page.tsx`** — dodać nową `Card title="Harmonogram odświeżania"` renderującą nowy komponent
  formularza; przekazać bieżące wartości z `getSetting(SETTING_KEYS.cronQuotes/…)` (z fallbackiem na `DEFAULT_CRON`).
- **`src/components/ScheduleSettingsForm.tsx`** *(nowy, client component)* — dwa pola tekstowe (cron notowań / cron newsów)
  + „Zapisz”, POST do `/api/settings`, `router.refresh()`. Wzorzec skopiować z `src/components/AiSettingsForm.tsx`
  (ten sam kształt: `useState` + `fetch("/api/settings", POST)` + komunikat). Reużyć `Button`, `Input`, `Label` z `./ui`.
  Krótka podpowiedź pod polem (składnia cron, „puste pole = wyłączone”, przykładowe wartości).

**Bez zmian (potwierdzone):** `refreshQuotes()` / `refreshNews()` — sygnatury pasują 1:1, „bez filtra = wszystkie spółki”
już działa (`src/lib/quotes.ts:110-120`). `next.config.ts` — `output: 'standalone'` już ustawiony; nie wymaga flagi
pod instrumentation (patrz Ryzyka co do weryfikacji standalone).

## Kryteria akceptacji

- [ ] Po `npm run dev` w logu pojawia się `[scheduler] wystartował` **dokładnie raz** (nie dubluje po zapisie pliku / HMR).
- [ ] Zadania odpalają się zgodnie z harmonogramem (test: tymczasowo ustawić `*/1 * * * *` i zaobserwować przebieg
      co minutę w logu + zmianę `quotes_latest.updated_at` / nowe `news_items`).
- [ ] Zmiana wartości cron w panelu Ustawień → zapis → nowy harmonogram obowiązuje **bez restartu serwera**.
- [ ] Puste pole cron → dane zadanie nie odpala się (jest zatrzymane).
- [ ] Niepoprawne wyrażenie cron w UI → API zwraca 400 i UI pokazuje błąd (dane nie zapisane).
- [ ] Guard nakładania: przy sztucznie wydłużonym `refreshQuotes` kolejny tick loguje „pomijam tick”, nie odpala drugiego przebiegu.
- [ ] Cron działa tylko w Node — brak prób ładowania node-cron w runtime edge (guard `NEXT_RUNTIME`).
- [ ] Harmonogram przetwarza wszystkie spółki (bez filtra portfel/watchlist) i wszystkie włączone źródła newsów.
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] W buildzie standalone (`node .next/standalone/server.js` lub obraz Docker) scheduler startuje i tickuje 24/7.

## Ryzyka

- **Lokalizacja instrumentation.** Częsty błąd z pamięci treningowej: root zamiast `src/`. W tym repo (z `src/app`)
  plik MUSI być `src/instrumentation.ts`, inaczej `register()` się nie odpali i cron nigdy nie wstanie. Zweryfikować,
  że log startowy się pojawia.
- **Standalone + Docker.** `output: 'standalone'` — upewnić się, że `src/instrumentation.ts` trafia do output tracingu
  i że produkcyjny serwer standalone faktycznie woła `register()` (historycznie w Next bywały regresje z instrumentation
  w standalone). Test: uruchomić zbudowany `.next/standalone/server.js` i sprawdzić log schedulera; docelowo w obrazie Docker.
- **API node-cron zależne od wersji.** node-cron v4 (2025) zmienił część API względem v3 (m.in. nazwane zadania,
  `task.destroy()`, `getTasks()`). Plan zakłada API v3 (`cron.schedule`, `cron.validate`, `task.stop()`, opcja `{ timezone }`).
  Po instalacji zweryfikować rzeczywiste API zainstalowanej wersji i dostosować `scheduler.ts` (zgodnie z regułą AGENTS.md
  „nie zakładaj API bibliotek”). Rekomendacja: pin do v3 dla przewidywalności albo świadome przejście na v4 z jego API.
- **Strefa czasowa.** Bez `timezone: 'Europe/Warsaw'` harmonogram `9-17` na kontenerze UTC odpali się 2h za wcześnie
  (poza sesją GPW). To realny błąd na produkcji Docker — trzymać TZ jawnie w `cron.schedule`.
- **Duplikacja przy HMR w dev.** Guard `state.initialized` na `globalThis` jest krytyczny; bez niego każdy hot-reload
  dokłada kolejny zestaw zadań. Ten sam wzorzec co `__investDb` — trzymać się go.
- **Współbieżność z ręcznym odświeżaniem.** Guard `isRunning` chroni tylko przed nakładaniem *crona na cron*.
  Ręczny przycisk może wystartować `refreshQuotes()` równolegle z tickiem crona. `refreshQuotes`/`refreshNews`
  operują na SQLite z `busy_timeout = 15000` i idempotentnymi upsertami (`onConflictDoUpdate`/`onConflictDoNothing`,
  `src/lib/quotes.ts`, `src/lib/news.ts`), więc równoległość jest bezpieczna danych, choć może podwoić ruch do Yahoo/NBP.
  Świadomie akceptowane (guard w bazie był explicite odrzucony przez użytkownika).
- **Limity Yahoo.** Częstszy harmonogram = więcej zapytań; obsługa 429 jest już w `src/lib/yahoo.ts`. Domyślne
  `*/15` w godzinach sesji jest bezpieczne, ale ostrzec w UI przed agresywnymi interwałami (np. `*/1`).
- **`register()` nie może rzucić.** Docs: musi się zakończyć zanim serwer przyjmie ruch. `startScheduler()` nie może
  wykonywać ciężkiej pracy synchronicznie ani rzucać — samo planuje zadania (szybkie), właściwe `refresh*` biegną w tickach.

## Pytania do doprecyzowania

Wszystkie decyzje potwierdzone z użytkownikiem:

- **Włączanie/wyłączanie:** pusty string = wyłączone (bez osobnej flagi `enabled`).
- **„Uruchom teraz”:** nie dodajemy osobnego przycisku w panelu Harmonogramu — istniejące `RefreshButtons.tsx`
  na dashboardzie wystarczają.
- **Walidacja cron w UI:** tylko prosta walidacja serwerowa (`cron.validate`, 400 przy błędnej składni) —
  bez podglądu „następnych uruchomień” i bez presetów.
- **Widoczność stanu ostatniego przebiegu:** poza zakresem (tylko log konsolowy), zgodnie z wcześniejszą
  decyzją o guardzie w pamięci procesu bez zapisu statusu do bazy.
- **Wersja node-cron:** pin do **v3** (`^3.0.3`) — stabilne, znane API użyte w szkicu kodu powyżej.
