# context/ — dokumentacja projektu

Dokumenty opisujące invest-dashboard: wymagania, architekturę, wiedzę operacyjną
i kierunki rozwoju. Stan na 2026-07-07 (wersja 1.0 aplikacji).

| Dokument | Co zawiera | Kiedy sięgać |
|---|---|---|
| [PRD.md](PRD.md) | Wizja, użytkownik, wymagania funkcjonalne per moduł, wymagania niefunkcjonalne, świadome wykluczenia, kryteria ukończenia v1 | Gdy trzeba zrozumieć **co** aplikacja robi i dlaczego w takim zakresie |
| [architecture.md](architecture.md) | Stack, struktura katalogów, pełny schemat bazy, przepływy danych, lista API routes, algorytmy silnika portfela (FIFO, D-1, sweep) | Gdy trzeba zrozumieć **jak** to działa przed zmianą kodu |
| [data-sources.md](data-sources.md) | Yahoo Finance (pułapka `range=max`!), NBP, kanały RSS (działające i martwe), OpenRouter — endpointy, limity, obsługa błędów | Przed każdą pracą przy integracji danych — chroni przed powtórzeniem odkrytych pułapek |
| [decisions.md](decisions.md) | Rejestr decyzji architektonicznych (ADR): kontekst → decyzja → uzasadnienie → konsekwencje | Gdy pojawia się pytanie „czemu to jest zrobione tak, a nie inaczej" |
| [roadmap.md](roadmap.md) | Usprawnienia i nowe funkcjonalności w 7 kategoriach z wyceną złożoności (S/M/L), zależnościami i tabelą TOP 10 | Przy planowaniu kolejnej iteracji |

Uwaga: dokumenty opisują stan na datę powstania — kod (`src/`) jest zawsze
ostatecznym źródłem prawdy. Po większych zmianach zaktualizuj odpowiedni dokument.
