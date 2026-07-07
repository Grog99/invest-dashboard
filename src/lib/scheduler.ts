// Harmonogram odświeżania w procesie Next (node-cron). Startuje raz na proces
// serwera z src/instrumentation.ts; przeładowywany po zapisie ustawień w
// POST /api/settings. Reużywa refreshQuotes()/refreshNews() — te same funkcje,
// których używają przyciski ręcznego odświeżania.
//
// Uwaga: node-cron ładowany wyłącznie w runtime Node.js (patrz
// src/instrumentation.ts — guard NEXT_RUNTIME). Ten moduł nie jest edge-safe.

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

// Singleton na globalThis — przeżywa hot-reload w dev (ten sam wzorzec co
// globalForDb w src/db/index.ts), żeby register() wywołany ponownie przy HMR
// nie zdublował zadań.
const g = globalThis as unknown as { __investScheduler?: SchedulerState };
const state: SchedulerState =
  g.__investScheduler ?? { tasks: {}, running: {}, initialized: false };
g.__investScheduler = state;

const TZ = "Europe/Warsaw";

async function runGuarded(name: JobName, fn: () => Promise<unknown>) {
  if (state.running[name]) {
    console.warn(`[scheduler] ${name}: poprzedni przebieg jeszcze trwa — pomijam tick`);
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

// Planuje (lub wyłącza) jedno zadanie. Zatrzymuje poprzedni task (reload),
// puste/niepoprawne wyrażenie = wyłączone (nic nie planujemy).
function scheduleJob(name: JobName, expr: string, fn: () => Promise<unknown>) {
  state.tasks[name]?.stop();
  delete state.tasks[name];

  const trimmed = expr.trim();
  if (!trimmed || !cron.validate(trimmed)) {
    if (trimmed) {
      console.warn(`[scheduler] ${name}: niepoprawne wyrażenie cron "${trimmed}" — zadanie wyłączone`);
    }
    return;
  }

  state.tasks[name] = cron.schedule(trimmed, () => runGuarded(name, fn), {
    timezone: TZ,
  });
  console.log(`[scheduler] ${name}: zaplanowano "${trimmed}" (${TZ})`);
}

// Przeładowuje oba zadania na podstawie bieżących ustawień z bazy (fallback
// na domyślne harmonogramy). Wołane przy starcie i po zapisie ustawień.
export function reloadScheduler(): void {
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

// Wołane raz z instrumentation.ts. Idempotentne — chroni przed dublowaniem
// zadań przy hot-reload (dev) dzięki fladze initialized na globalThis.
export function startScheduler(): void {
  if (state.initialized) return;
  state.initialized = true;
  reloadScheduler();
  console.log("[scheduler] wystartował");
}
