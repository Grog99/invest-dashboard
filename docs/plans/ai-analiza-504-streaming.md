# Analiza AI — naprawa błędu 504 (przejście na streaming)

> Slug: `ai-analiza-504-streaming`. Branch: `claude/ai-analysis-504-error-om8cu1`.
> Kontynuacja `docs/plans/ai-analiza-notatki.md` (tam świadomie wybrano
> non-streaming, tu tę decyzję cofamy — poniżej dlaczego).

## Kontekst / Problem

Na produkcji generowanie analizy AI kończyło się błędem w modalu:

> `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`

a w konsoli: `Failed to load resource: the server responded with a status of
504`. W logach OpenRoutera request przechodził poprawnie (model kończył
generowanie), więc problem nie był po stronie modelu.

**Przyczyna:** `POST /api/ai/analyze` był **non-streaming** — route robił
`await upstream.json()`, czyli buforował **całą** odpowiedź OpenRoutera (z web
searchem + reasoningiem potrafi to trwać wiele sekund / minuty) i dopiero potem
odsyłał JSON do przeglądarki. Aplikacja stoi za reverse proxy (Docker /
`next start`), a ten ma własny timeout bezczynności krótszy niż czas
generowania. Nie widząc żadnych bajtów, proxy zrywało połączenie i zwracało
**stronę HTML 504**. Klient robił na niej bezwarunkowo `await res.json()` →
`JSON.parse("<!DOCTYPE …")` → „Unexpected token '<'". OpenRouter kończył request
już „po fakcie", gdy proxy dawno zamknęło połączenie do przeglądarki.

Ryzyko było wprost przewidziane w pierwotnym planie
(`ai-analiza-notatki.md`, sekcja „Ryzyka": *„Ślepe czekanie (non-streaming) +
timeout … web search + pełna notatka mogą się zbliżyć do limitu"*). Czat AI
(`/api/ai/chat`) nigdy nie miał tego problemu, bo od początku **streamuje**.

## Podejście

Ujednolicamy transport z działającym czatem — **streaming SSE**. Ciągły
strumień tokenów utrzymuje połączenie żywe, więc proxy nie odpala 504.

1. **`src/lib/ai.ts`** — `openrouterChat` dostaje opcję `includeUsage`, która
   dokłada do body OpenRoutera `usage: { include: true }`. Przy `stream: true`
   OpenRouter dosyła koszt/tokeny w ostatnim chunku SSE — zachowujemy więc
   rozliczenie kosztu z pierwotnego featuru.
2. **`src/app/api/ai/analyze/route.ts`** — zamiast `stream: false` +
   `await upstream.json()`, wołamy `openrouterChat(..., { stream: true,
   includeUsage: true })` i proxyujemy strumień SSE do klienta (jak
   `/api/ai/chat`). Walidacja parametrów (400) i błędy konfiguracji/HTTP z
   OpenRoutera (502) zostają — lecą przed startem streamu. Dokładamy:
   - **heartbeat** — helper `sseWithHeartbeat` co ~15 s wstrzykuje komentarz
     `: ping`, żeby proxy nie zerwało połączenia w ciszy przed pierwszym
     tokenem (faza web searchu / rozgrzewki reasoningu). Klient ignoruje linie
     zaczynające się od `:`.
   - nagłówek **`X-Accel-Buffering: no`** — wyłącza buforowanie SSE przez
     nginx/reverse proxy.
3. **`src/lib/sse.ts`** — nowa funkcja `streamAnalyze(body, onDelta?, signal?)`:
   czyta SSE, akumuluje `delta.content`, wyciąga `usage` z finalnego chunku i
   zwraca `{ content, usage }`. Obsługuje `error` w strumieniu i `!res.ok`
   (odczyt JSON-owego błędu 400/502). `streamChat` i `/api/ai/chat` bez zmian.
4. **`src/components/AiAnalyzeModal.tsx`** — `run()` używa `streamAnalyze`
   zamiast `fetch`+`res.json()`. UX bez zmian: treść aplikowana po zakończeniu
   (`onFillResult`/`onGenerateResult`), koszt/tokeny w kafelku, modal zostaje
   otwarty. Pusta treść (refusal) → komunikat, notatka NIE nadpisana pustką.

## Kryteria akceptacji

- [x] `POST /api/ai/analyze` streamuje SSE (`text/event-stream`), nie buforuje
      całej odpowiedzi.
- [x] Długa analiza (web search + reasoning) nie kończy się 504 — połączenie
      podtrzymywane tokenami + heartbeatem.
- [x] Koszt/tokeny nadal widoczne po zakończeniu (z ostatniego chunku SSE).
- [x] Błąd/refusal → komunikat w modalu, notatka nie nadpisana pustką.
- [x] `npm run lint` i `npm run build` przechodzą.

## Non-goals

- Progresywne renderowanie strumienia w edytorze (treść nadal aplikowana w
  całości po zakończeniu) — poza zakresem tej naprawy.
- Zmiany w `AiChat.tsx` / `streamChat` / `/api/ai/chat` (działają, bez zmian).
