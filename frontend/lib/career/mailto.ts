// Mail apps read a mailto link's newlines as CRLF, so every newline form becomes one.
const crlf = (text: string) => text.replace(/\r\n|\r|\n/g, "\r\n");

// shortcut: a very long body is not cut (mail apps cap the link around 2,000 characters), upgrade by trimming the body or telling the User to use Copy.
export function mailtoLink(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(crlf(subject))}&body=${encodeURIComponent(crlf(body))}`;
}
