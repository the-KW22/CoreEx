import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatMarkdown, safeHref } from "./chat-markdown";

describe("safeHref", () => {
  it.each([
    ["javascript:alert(1)", null],
    ["  JavaScript:alert(1)", null],
    ["JAVASCRIPT:alert(1)", null],
    ["data:text/html,hi", null],
    ["vbscript:msgbox", null],
    [undefined, null],
    ["https://example.com/a", "https://example.com/a"],
    ["  https://example.com ", "https://example.com"],
    ["mailto:a@example.com", "mailto:a@example.com"],
    ["/notes/1", "/notes/1"],
    ["//evil.example/x", null],
    ["/\\evil.example/x", null],
    ["#section", "#section"],
  ])("maps %j to %j", (href, expected) => {
    expect(safeHref(href)).toBe(expected);
  });
});

describe("ChatMarkdown", () => {
  it("renders no raw HTML, no javascript links and no images", () => {
    const html = renderToStaticMarkup(
      createElement(ChatMarkdown, null, "<script>alert(1)</script> [x](javascript:alert(1)) ![i](http://e/x.png)"),
    );
    expect(html).not.toContain("<script");
    // The HTML-block input is shown as escaped text, so check for no javascript link rather than the text.
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<img");
  });
});
