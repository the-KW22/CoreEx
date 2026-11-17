import { describe, expect, it } from "vitest";

import { mailtoLink } from "./mailto";

// Reads a mailto link back the way a mail app does.
const read = (link: string) => {
  const url = new URL(link);
  return { to: url.pathname, subject: url.searchParams.get("subject"), body: url.searchParams.get("body") };
};

describe("mailto link", () => {
  it("encodes spaces as %20, not +", () => {
    expect(mailtoLink("Hello there", "a b")).toBe("mailto:?subject=Hello%20there&body=a%20b");
  });

  it("turns every newline form into CRLF and encodes it", () => {
    expect(mailtoLink("s", "one\ntwo\r\nthree\rfour")).toBe("mailto:?subject=s&body=one%0D%0Atwo%0D%0Athree%0D%0Afour");
  });

  it("encodes &, # and ? so they do not split the link", () => {
    expect(read(mailtoLink("A & B", "x#y?z=1"))).toEqual({ to: "", subject: "A & B", body: "x#y?z=1" });
  });

  it("encodes percent signs", () => {
    expect(mailtoLink("100%", "50%25")).toBe("mailto:?subject=100%25&body=50%2525");
  });

  it("keeps accents and emoji intact", () => {
    expect(read(mailtoLink("Café ☕", "naïve 🚀"))).toEqual({ to: "", subject: "Café ☕", body: "naïve 🚀" });
  });

  it("gives an empty body", () => {
    expect(mailtoLink("Subject", "")).toBe("mailto:?subject=Subject&body=");
  });

  it("round trips a multi-line body with CRLF newlines", () => {
    const body = "Dear Sam,\n\nThanks & regards,\nAlex";
    expect(read(mailtoLink("Re: 100% sure?", body))).toEqual({
      to: "",
      subject: "Re: 100% sure?",
      body: "Dear Sam,\r\n\r\nThanks & regards,\r\nAlex",
    });
  });
});
