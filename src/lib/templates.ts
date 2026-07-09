// Szablony notatek researchowych: wbudowane (stałe w kodzie) + scalanie z
// własnymi szablonami użytkownika (tabela note_templates, src/db/schema.ts).
// Bez "use client" — importowalny zarówno w server components
// (src/app/research/new/page.tsx, src/app/settings/page.tsx), jak i w
// kliencie (NoteEditor.tsx, TemplatesManager.tsx).
// Patrz docs/plans/szablony-tez-inwestycyjnych.md.

import type { NoteTemplate } from "@/db/schema";

export const BUILTIN_TEMPLATES: { slug: string; name: string; content: string }[] = [
  {
    slug: "teza",
    name: "Teza inwestycyjna",
    content: `## Teza
_Dlaczego warto (lub nie warto) mieć tę spółkę w portfelu — w 2–3 zdaniach._

## Katalizatory
- _Co może pchnąć kurs w górę i w jakim horyzoncie?_
-

## Ryzyka
- _Co może pójść nie tak? Co obaliłoby tezę?_
-

## Wycena
_Aktualna wycena vs. wartość godziwa — mnożniki (P/E, EV/EBITDA), założenia, porównanie do peerów._

## Warunki wyjścia
- **Realizacja zysku:** _przy jakiej cenie / po spełnieniu jakiej tezy sprzedaję?_
- **Cięcie straty:** _co musi się wydarzyć, żebym uznał tezę za obaloną i wyszedł?_`,
  },
  {
    slug: "szybka",
    name: "Szybka notatka",
    content: `## Obserwacja
_Co zauważyłem / co się wydarzyło?_

## Wniosek
_Co z tego wynika? Co robię dalej?_

## Do sprawdzenia
-`,
  },
  {
    slug: "wyniki-kwartalne",
    name: "Podsumowanie wyników kwartalnych",
    content: `## Wyniki za [okres]
_Przychody, EBITDA, zysk netto — wartości oraz dynamika r/r i vs. konsensus._

## Kluczowe liczby
| Pozycja | Bieżący okres | Rok temu | Zmiana r/r |
| --- | --- | --- | --- |
| Przychody |  |  |  |
| EBITDA |  |  |  |
| Zysk netto |  |  |  |
| Marża netto |  |  |  |

## Co zaskoczyło (plus / minus)
-

## Komentarz zarządu / guidance
_Prognozy, plany, ton komunikacji._

## Wpływ na tezę
_Czy wyniki potwierdzają, czy podważają moją tezę inwestycyjną? Czy zmieniam pozycję?_`,
  },
];

export type TemplateOption = {
  key: string;
  label: string;
  group: "builtin" | "user";
  content: string;
};

// Scala wbudowane szablony (kluczowane "builtin:<slug>") z własnymi
// szablonami użytkownika z bazy (kluczowane "user:<id>") w jedną listę do
// wyboru w dropdownie NoteEditora / liście w TemplatesManager.
export function buildTemplateOptions(userTemplates: NoteTemplate[]): TemplateOption[] {
  return [
    ...BUILTIN_TEMPLATES.map((t) => ({
      key: `builtin:${t.slug}`,
      label: t.name,
      group: "builtin" as const,
      content: t.content,
    })),
    ...userTemplates.map((t) => ({
      key: `user:${t.id}`,
      label: t.name,
      group: "user" as const,
      content: t.content,
    })),
  ];
}
