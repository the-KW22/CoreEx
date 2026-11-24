import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Model output is untrusted: only web, mail and in-app links survive. Anything else becomes plain text.
export function safeHref(href: string | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  // "//host" and "/\host" are links to another site, not in-app ones.
  if (trimmed.startsWith("#") || (trimmed.startsWith("/") && !/^\/[/\\]/.test(trimmed))) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" ? trimmed : null;
  } catch {
    return null; // not an absolute URL and not relative
  }
}

const components: Components = {
  h1: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold text-foreground first:mt-0">{children}</h3>,
  h2: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold text-foreground first:mt-0">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-2 mb-1 text-sm font-medium text-foreground first:mt-0">{children}</h5>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  a: ({ href, children }) => {
    const safe = safeHref(href);
    if (!safe) return <>{children}</>;
    const external = /^https?:|^mailto:/.test(safe);
    return (
      <a
        href={safe}
        className="text-foreground underline underline-offset-2"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  },
  // Images are never loaded from model output.
  img: () => null,
  code: ({ children }) => (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md border border-border bg-surface p-3 text-xs leading-relaxed [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border px-2 py-1 font-medium text-foreground">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-2 py-1">{children}</td>,
};

// Raw HTML is not rendered: no rehype-raw, so HTML in the text is dropped.
export function ChatMarkdown({ children }: { children: string }) {
  return (
    <div className="min-w-0 break-words text-sm text-foreground">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
