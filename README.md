# Invest Dashboard

Prywatny dashboard inwestycyjny działający w całości lokalnie — portfel akcji,
watchlista, monitoring newsów i research spółek wspierany przez AI.

## Funkcje

- **Dashboard** — wartość portfela w PLN, dzienna zmiana, wynik niezrealizowany,
  zyski zrealizowane + dywidendy, wykres wartości portfela (12 mies.), alokacja,
  ostatnie newsy.
- **Portfel** — pozycje liczone z historii transakcji metodą **FIFO**, przeliczenia
  na PLN po kursach NBP (kurs D-1 pod podatek), dywidendy, zrealizowane sprzedaże
  oraz roczne podsumowanie pomocnicze pod **PIT-38**.
- **Watchlista** — spółki obserwowane bez pozycji, z notowaniami i licznikiem
  nieprzeczytanych newsów.
- **Karta spółki** — wykres kursu (3M/1R/3L/MAX), transakcje, dopasowane newsy,
  notatki i czat AI z kontekstem spółki.
- **Newsy** — kanały RSS (domyślnie: komunikaty ESPI Bankiera, Bankier Giełda
  i Wiadomości, Strefa Inwestorów), automatyczne dopasowanie wpisów do spółek
  po tickerze / nazwie / aliasach, własne źródła globalne lub per spółka.
- **Research** — notatki w markdown z podglądem, przypisywane do spółek,
  generowanie analiz przez AI (streaming) z możliwością dopisywania własnych treści.
- **AI przez OpenRouter** — dowolny model (Claude, GPT, Gemini…), klucz i model
  konfigurowane w Ustawieniach; AI dostaje kontekst: notowania, pozycję, newsy
  i Twoje notatki o spółce.

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:3000
```

Wersja produkcyjna (szybsza):

```bash
npm run build
npm start
```

## Pierwsze kroki

1. **Portfel → + Spółka** — dodaj spółkę (GPW: ticker np. `PKN`, symbol notowań
   uzupełni się jako `PKN.WA`; USA: np. `AAPL`). Notowania pobiorą się od razu.
2. **Portfel → + Transakcja** — wpisz transakcje kupna/sprzedaży (data, ilość,
   cena, prowizja). Pozycje, wyniki i PIT-38 wyliczą się same.
3. **Newsy → Pobierz newsy** — domyślne źródła RSS dodadzą się przy pierwszym
   pobraniu. Aliasy spółki (np. "Orlen, PKN Orlen") poprawiają dopasowanie.
4. **Ustawienia** — wklej klucz API z [openrouter.ai/keys](https://openrouter.ai/keys),
   aby włączyć czat AI i generowanie analiz.

## Źródła danych

| Dane | Źródło | Uwagi |
|---|---|---|
| Notowania + historia | Yahoo Finance (nieoficjalne API) | opóźnienie ~15 min; GPW przez sufiks `.WA` |
| Kursy walut | API NBP (tabela A) | kurs D-1 do wyliczeń podatkowych |
| Newsy | kanały RSS | konfigurowalne w Ustawieniach |
| AI | OpenRouter | klucz przechowywany lokalnie |

## Dane i kopia zapasowa

Wszystko (transakcje, notatki, cache notowań, ustawienia, klucz API) trzymane
jest lokalnie w **`data/invest.db`** (SQLite). Kopia zapasowa = kopia tego pliku.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
SQLite (better-sqlite3 + Drizzle ORM) · lightweight-charts · Recharts ·
react-markdown · fast-xml-parser

## Zastrzeżenie

Wyliczenia (w tym PIT-38) mają charakter pomocniczy — przed rozliczeniem
podatkowym zweryfikuj je z dokumentami od brokera (PIT-8C). Aplikacja nie
stanowi porady inwestycyjnej.
