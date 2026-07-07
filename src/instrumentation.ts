// Uruchamia harmonogram odświeżania (node-cron) raz na start instancji
// serwera Next. Plik musi być w src/ (nie w roocie repo), bo projekt trzyma
// app w src/app — patrz node_modules/next/dist/docs/.../instrumentation.md
// ("If you're using the src folder, then place the file inside src").
//
// register() jest wołane w każdym runtime (nodejs i edge) — node-cron nie
// jest edge-safe (natywne timery procesu), więc ładujemy scheduler wyłącznie
// gdy NEXT_RUNTIME === "nodejs", przez dynamiczny import w środku register().
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
