# <Nazwa featurea>

> Plan wygenerowany przez skill `/plan-feature`. Slug: `<slug>`. Branch: `feature/<slug>`.

## Kontekst / Problem

Dlaczego robimy ten feature — jaki problem lub potrzebę adresuje, co go wywołało, jaki jest oczekiwany efekt.

## Wymagania

- Wymaganie funkcjonalne 1
- Wymaganie funkcjonalne 2
- Wymagania niefunkcjonalne (wydajność, format danych, i18n itd.), jeśli istotne

## Zakres i Non-goals

**W zakresie:**
- ...

**Non-goals (świadomie pomijamy):**
- ...

## Podejście

Rekomendowane podejście na wysokim poziomie. Kluczowe decyzje architektoniczne i uzasadnienie. Jeśli odrzucono alternatywę — jedno zdanie dlaczego.

Pamiętaj o regule z `AGENTS.md`: przed założeniem API Next.js sprawdź `node_modules/next/dist/docs/`.

## Pliki do zmiany

Konkretne ścieżki i co się w nich dzieje. **Wskaż istniejące utility/komponenty do reużycia** (ze ścieżkami), zamiast pisać od zera.

- `path/do/pliku.ts` — co i po co
- Reużyj: `path/do/istniejacego/util.ts` (funkcja `foo`)

## Kryteria akceptacji

Obserwowalne warunki „done" — jak poznać, że feature działa (najlepiej dające się sprawdzić w preview / lint / build).

- [ ] ...
- [ ] `npm run lint` i `npm run build` przechodzą
- [ ] Aplikacja odpala się i feature działa w preview

## Ryzyka

Pułapki, zależności zewnętrzne, miejsca łatwe do zepsucia (np. pułapki źródeł danych Yahoo/Stooq/Bankier RSS, jeśli dotyczy).

## Pytania do doprecyzowania

Otwarte pytania do użytkownika o feature lub implementację. Główny agent zada je po planowaniu i wykreśli po uzyskaniu odpowiedzi.

- [ ] Pytanie 1
- [ ] Pytanie 2
