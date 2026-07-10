# Suma zysków na dashboardzie („Łączny wynik”)

> Plan wygenerowany przez skill `/plan-feature`. Slug: `dashboard-profit-summary`. Branch: `claude/dashboard-profit-summary-qf30qr`.

## Kontekst / Problem

Na głównym dashboardzie (`src/app/page.tsx`) użytkownik widzi dziś kilka osobnych liczb opisujących
wynik portfela, ale **nigdzie nie ma jednej, zsumowanej kwoty „czy ogólnie jestem na plusie czy na
minusie”**. Żeby to ustalić, trzeba ręcznie zsumować wartości rozrzucone po hero „Karcie majątku”
(niezrealizowane, sesja) i po sekcji Ledger poniżej („Wynik niezrealizowany”, „Zrealizowane +
dywidendy”, „Wynik CFD (mark-to-market)”). To niewygodne i podatne na błąd.

Cel: dodać w hero „Karcie majątku” **jedną, czytelną liczbę „Łączny wynik”** — sumę wszystkich
składników P&L (niezrealizowany + zrealizowany + dywidendy + CFD), z procentem zwrotu liczonym
względem kosztu nabycia. Pełny obraz „na plusie / na minusie” w jednym miejscu.

## Wymagania

- Nowy wskaźnik **„Łączny wynik”** w hero „Karcie majątku” na górze dashboardu, obok istniejących
  bloków „Wartość portfela” i „Wynik sesji”.
- Suma obejmuje **wszystko razem**: niezrealizowany P&L + zrealizowany P&L + dywidendy + wynik CFD
  (mark-to-market):
  `totalPnlPln = summary.totalUnrealizedPln + summary.totalRealizedPln + summary.totalDividendsPln + cfd.totalCfdPnlPln`.
- Obok kwoty PLN pokazać **procent zwrotu** liczony względem kosztu nabycia:
  `totalPnlPct = totalCostPln > 0 ? (totalPnlPln / totalCostPln) * 100 : null` (gdy `totalCostPln <= 0`,
  procent nie jest renderowany — analogicznie do istniejącego `unrealizedPct`).
- **Kolorowanie** kwoty i procentu: zielony / czerwony / neutralny wg progu z `returnToneClass(value)`
  (`page.tsx` linia 33) — spójnie z „Wynikiem sesji” i wierszami Ledger.
- **Formatowanie** przez istniejące formatery z `@/lib/format`: kwota `fmtSignedMoney(totalPnlPln)`
  (znak `+` dla dodatnich), procent `fmtPct(totalPnlPct, 1)`.
- **Responsywność mobilna (~360–390 px):** wskaźnik czytelny i bez poziomego scrolla całej strony;
  reguła z `AGENTS.md`. Zweryfikować w przeglądarce, nie tylko na desktopie.

## Zakres i Non-goals

**W zakresie:**
- Jedna pochodna kalkulacja (`totalPnlPln`, `totalPnlPct`, tone) w `src/app/page.tsx`.
- Jeden nowy blok JSX w hero „Karcie majątku” (wewnątrz istniejącego kontenera hero, w gałęzi
  `hasHoldings === true`).

**Non-goals (świadomie pomijamy):**
- **Brakujące dane** (np. brak kursu NBP dla waluty): sumujemy z dostępnych wartości — null-e są już
  pomijane w `computePortfolio()`/`computeCfdPositions()` (reduce z `?? 0`), a istniejący żółty box
  `summary.warnings` (linie 199–207) wystarcza jako sygnał. **Nie** dodajemy osobnego komunikatu przy
  nowym wskaźniku.
- **Sekcja Ledger** (linie 380–403: „Wynik niezrealizowany”, „Zrealizowane + dywidendy”, „Wynik CFD”)
  — **bez zmian**. Umiejscowienie wybrano w hero, nie tutaj. Ledger pozostaje jako rozbicie składników;
  nowy wskaźnik to ich suma.
- Osobna nowa karta / osobny wiersz w Ledgerze — odrzucone, feature ma być w hero.
- Pełna stopa zwrotu (TWR/XIRR), zmiany w bazie/API/schemacie, nowe formatery.

## Podejście

**Umiejscowienie i layout — dedykowany wiersz-band pod dwoma blokami, wewnątrz tej samej karty hero.**
Nowy wskaźnik dodajemy jako **osobny, pełnoszerokościowy wiersz** wstawiony **między** kontener z dwoma
istniejącymi blokami (`<div className="flex flex-wrap items-start justify-between gap-6">`, kończący się
na linii 290) a sekcję benchmarku (`<div className="mt-5">`, linia 292). Wiersz oddzielony górną
krawędzią: `mt-5 border-t border-border pt-4`.

Uzasadnienie (jedno zdanie): trzeci element w istniejącym `flex flex-wrap items-start justify-between`
rozbiłby układ `justify-between` (lewy blok rośnie `min-w-0`, prawy jest `text-right`) i zawijałby się
nieprzewidywalnie na ~360 px, więc bezpieczniejszy i czytelniejszy jest osobny wiersz-„bottom line” na
całą szerokość karty — naturalnie stackuje się na mobile bez ryzyka poziomego scrolla.

**Kalkulacja.** Dokładamy 3 linie obok istniejących pochodnych (linie 106–114, tuż po `unrealizedPct` /
`closedTotal`):
```ts
const totalPnlPln =
  summary.totalUnrealizedPln +
  summary.totalRealizedPln +
  summary.totalDividendsPln +
  cfd.totalCfdPnlPln;
const totalPnlPct =
  summary.totalCostPln > 0 ? (totalPnlPln / summary.totalCostPln) * 100 : null;
const totalPnlTone = returnToneClass(totalPnlPln);
```
Wszystkie pola `PortfolioSummary` (`totalUnrealizedPln`, `totalRealizedPln`, `totalDividendsPln`,
`totalCostPln`) oraz `CfdSummary.totalCfdPnlPln` są typu `number` (null-e już scalone przez `?? 0`
w reduce'ach — patrz `src/lib/portfolio.ts` linie 255–262 i `src/lib/cfd.ts` linia 69), więc suma jest
zawsze skończoną liczbą — brak dodatkowej obsługi null przy samej kwocie.

**Markup — reużycie istniejących wzorców.** Wiersz składa się z:
- etykiety w stylu identycznym jak dwa istniejące bloki: `text-[11px] font-semibold uppercase
  tracking-wider text-ink2`, treść **„Łączny wynik”**;
- dużej kwoty ze znakiem: `fmtSignedMoney(totalPnlPln)` w klasie `text-[28px] font-bold tracking-tight
  tabular-nums sm:text-[30px]` + `${totalPnlTone}` (analogicznie do bloku „Wynik sesji”, linia 281);
- procentu jako kolorowej pigułki obok kwoty, **reużywając dokładnie wzorzec pigułki „niezrealizowane
  X%”** (linie 250–260): `inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold` z
  tłem `bg-pos/15 text-pos` / `bg-neg/15 text-neg` / `bg-surface2 text-ink2` wg znaku `totalPnlPct`;
  treść `fmtPct(totalPnlPct, 1)`. Pigułka renderowana tylko gdy `totalPnlPct !== null`.

Rozstrzygnięte z użytkownikiem: pigułka (nie inline jak `dayPct`), dla wizualnego sparowania
„kwota + %”.

**Reguła `AGENTS.md` „to NIE jest Next.js który znasz”.** Feature **nie wprowadza żadnego nowego API
Next.js** — to wyłącznie kalkulacja w TS + JSX w istniejącym server component (`page.tsx` już ma
`export const dynamic = "force-dynamic"`, bez zmian). Nie dotykamy `metadata`/`viewport`/route
handlerów/konwencji plików, więc nie ma założeń o API Next do weryfikacji w `node_modules/next/dist/docs/`.

## Pliki do zmiany

**Baza (warstwa danych):** — brak —
_(Dane już dostępne: `computePortfolio()` → `PortfolioSummary` i `computeCfdPositions()` → `CfdSummary`
w `src/lib/portfolio.ts` / `src/lib/cfd.ts`. Nowa liczba to czysta suma istniejących pól — nie wymaga
zmiany funkcji domenowych ani schematu.)_

**Backend (warstwa backend):** — brak —
_(Brak route handlerów, zadań w tle, integracji. Dashboard renderuje się server-side w `page.tsx`.)_

**Frontend (warstwa frontend):**

- `src/app/page.tsx` — jedyny zmieniany plik:
  1. **Kalkulacja** — dodać `totalPnlPln`, `totalPnlPct`, `totalPnlTone` obok istniejących pochodnych
     (po linii ~112, przy `unrealizedPct` / `closedTotal`). Reużyj lokalnego `returnToneClass` (linia 33).
  2. **JSX** — wstawić nowy wiersz-band w hero „Karcie majątku”, **między** kontener dwóch bloków
     (koniec `flex flex-wrap items-start justify-between gap-6`, linia 290) a sekcję benchmarku
     (`<div className="mt-5">`, linia 292). Klasy oddzielające: `mt-5 border-t border-border pt-4`.
  3. **Reużycie formaterów** — `fmtSignedMoney` i `fmtPct` są już importowane (linia 10); nic nie
     dodajemy do importów. Pigułkę procentu kopiujemy ze wzorca „niezrealizowane X%” (linie 250–260)
     dla spójności; kolory z `returnToneClass` / progów `bg-pos/15|bg-neg/15|bg-surface2`.

Reużywane istniejące elementy (bez tworzenia nowych):
- `src/lib/format.ts` — `fmtSignedMoney(value, "PLN")` (znak `+`/`−`), `fmtPct(value, digits)` (znak `+`
  i sufiks `%`).
- `src/app/page.tsx` — helper `returnToneClass(value)` (linia 33), wzorzec pigułki (linie 250–260),
  wzorzec bloku kwoty „Wynik sesji” (linie 277–289).
- `src/components/ui.tsx` — `StatTile`/`Delta`/`Badge` **rozważone, ale niekonieczne**: hero używa
  własnego, „gazetowego” stylu inline (nie `StatTile`), więc dla spójności wizualnej wiersza w hero
  trzymamy się wzorców z samego `page.tsx`, nie wprowadzamy `StatTile` tylko tutaj.

## Kryteria akceptacji

- [ ] W hero „Karcie majątku” widoczny wiersz **„Łączny wynik”** z kwotą PLN (ze znakiem) i procentem
      zwrotu, gdy portfel ma pozycje (`hasHoldings`).
- [ ] Kwota = `totalUnrealizedPln + totalRealizedPln + totalDividendsPln + totalCfdPnlPln`; procent =
      `totalPnlPln / totalCostPln * 100` (lub ukryty, gdy `totalCostPln <= 0`). Zweryfikowane ręcznie
      przez zsumowanie liczb z Ledgera — suma z Ledgera zgadza się z „Łącznym wynikiem”.
- [ ] Kolor kwoty i procentu: zielony dla dodatniego, czerwony dla ujemnego, neutralny dla ~zera
      (progi jak `returnToneClass`, `±0.000001`).
- [ ] Wskaźnik czytelny w preview na **desktopie** i **mobile (~360–390 px)**; brak poziomego scrolla
      całej strony (`document.documentElement.scrollWidth <= clientWidth`).
- [ ] Istniejące bloki „Wartość portfela” i „Wynik sesji” oraz sekcja Ledger renderują się jak dotąd
      (brak regresji).
- [ ] `npm run lint` i `npm run build` przechodzą.
- [ ] Aplikacja odpala się i feature działa w preview.

## Ryzyka

- **Mianownik procentu.** Procent liczymy względem `totalCostPln` (koszt nabycia bieżących pozycji),
  choć suma obejmuje też zrealizowane, dywidendy i CFD — mianownik nie jest idealny dla tych składników.
  To **świadoma, spójna** decyzja (analogiczna do istniejącego `unrealizedPct`); pełna stopa zwrotu
  (TWR/XIRR) jest poza zakresem. Gdy `totalCostPln <= 0` (np. pusty koszt) procent chowamy — brak dzielenia
  przez zero.
- **Podwójne liczenie / spójność z hero.** „Wartość portfela” już zawiera `+ cfd.totalCfdPnlPln`
  (linia 245), a „Łączny wynik” dokłada CFD jako składnik P&L — to różne metryki (wartość vs. zysk),
  więc nie ma double-countingu; upewnić się przy review, że nie miksujemy wartości z zyskiem.
- **Layout mobile.** Trzeci blok w `flex justify-between` rozbiłby układ — dlatego osobny wiersz-band;
  mimo to zweryfikować na ~360 px, że kwota (`text-[28px]`) + pigułka procentu nie rozpychają karty.
- **CFD „ekspozycja niesumowana”.** Sumujemy P&L CFD (`totalCfdPnlPln`), nie ekspozycję — zgodnie z
  Ledgerem („poza FIFO/PIT-38 · ekspozycja niesumowana”). Bez zmian w tym zachowaniu.

## Pytania do doprecyzowania

Brak — rozstrzygnięte z użytkownikiem: etykieta **„Łączny wynik”**, procent jako **kolorowa
pigułka** (wzorzec „niezrealizowane X%”, linie 250–260).
