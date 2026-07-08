"use client";

import { isValidElement } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EmbeddedChart } from "./charts/EmbeddedChart";
import type { RangeKey } from "./charts/PriceChart";

const VALID_RANGES: readonly RangeKey[] = ["3M", "1R", "3L", "MAX"];

// Blok ```chart <SYMBOL> [ZAKRES]``` (feature 5.2) — parsuje identyfikator
// spółki i opcjonalny zakres z meta fence'a (kanoniczne:
// ```chart PKN.WA 1R```). Wywołujący dostarcza fallback (pierwsza niepusta
// linia treści bloku), gdyby `node.data.meta` było puste/niedostępne —
// [WERYFIKACJA 1] potwierdziła, że w react-markdown@10.1.0 meta JEST
// przekazywane, ale parser i tak zostaje odporny na obie formy.
function parseChartMeta(meta: string): { symbol: string; range?: RangeKey } {
  const [rawSymbol, rawRange] = meta.trim().split(/\s+/);
  const upperRange = rawRange?.toUpperCase();
  const range = VALID_RANGES.find((r) => r === upperRange);
  return { symbol: rawSymbol ?? "", range };
}

// Wyciąga tekst z drzewa React (children override'u `code`) — używane jako
// fallback, gdy fence nie ma meta (identyfikator wpisany w treść bloku).
function extractText(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: unknown };
    return extractText(props.children);
  }
  return "";
}

export function Markdown({
  children,
  embedCharts = true,
}: {
  children: string;
  embedCharts?: boolean;
}) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Kosmetyka dla wgranych załączników (![](/api/attachments/{id})) —
          // nie wychodzą poza kolumnę i mają spójny z resztą UI wygląd. Zwykły
          // <img> (nie next/image) — źródło to lokalny endpoint API bez
          // znanych wymiarów/rozmiarów wariantów, więc next/image nic by tu
          // nie zoptymalizował.
          img: ({ alt, ...rest }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...rest}
              alt={alt ?? ""}
              className="max-w-full rounded-lg border border-border"
            />
          ),
          // Blok ```chart <SYMBOL> [ZAKRES]``` → żywy PriceChart z danymi
          // z quotes_daily (feature 5.2). Rozróżnienie blok/inline w
          // react-markdown v9+ (prop `inline` usunięty) po obecności
          // `language-chart` w className — inline-code nigdy jej nie ma.
          code: ({ className, children: codeChildren, node, ...rest }) => {
            if (embedCharts !== false && className?.includes("language-chart")) {
              const meta =
                (node?.data as { meta?: string } | undefined)?.meta ||
                extractText(codeChildren).split("\n").find((l) => l.trim()) ||
                "";
              const { symbol, range } = parseChartMeta(meta);
              // `key` wymusza remount przy zmianie identyfikatora/zakresu —
              // gwarantuje świeży stan "loading" bez potrzeby synchronicznego
              // resetu stanu wewnątrz efektu w EmbeddedChart.
              return (
                <EmbeddedChart
                  key={`${symbol}:${range ?? ""}`}
                  symbol={symbol}
                  initialRange={range}
                />
              );
            }
            return (
              <code className={className} {...rest}>
                {codeChildren}
              </code>
            );
          },
          // react-markdown owija blokowy `code` w `<pre>` — renderowanie
          // wykresu wewnątrz `<pre>` to niepoprawny HTML i psuje layout
          // (monospace, white-space: pre). Gdy jedyne dziecko to nasz
          // chart-code, zwracamy samo dziecko (już zamienione na
          // EmbeddedChart powyżej) bez opakowania w <pre>.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- `node` musi zostać odrzucony, żeby nie wyciekł jako nieznany atrybut DOM na <pre>.
          pre: ({ children: preChildren, node, ...rest }) => {
            if (
              embedCharts !== false &&
              isValidElement(preChildren) &&
              (preChildren.props as { className?: string }).className?.includes(
                "language-chart"
              )
            ) {
              return <>{preChildren}</>;
            }
            return <pre {...rest}>{preChildren}</pre>;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
