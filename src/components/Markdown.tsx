"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
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
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
