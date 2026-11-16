import { describe, expect, it } from "vitest";

import { customStyles, parseCss, partOf } from "./custom-css";

describe("the custom rules parser", () => {
  it("reads rules for known parts with known values", () => {
    const { rules, problems } = parseCss("/* big names */ name { font-size: 26pt; color: #1D4ED8 }\nentry-title, entry-dates { font-weight: bold }");
    expect(problems).toEqual([]);
    expect(rules).toEqual([
      { parts: ["name"], declarations: [{ property: "font-size", value: "26pt" }, { property: "color", value: "#1D4ED8" }] },
      { parts: ["entry-title", "entry-dates"], declarations: [{ property: "font-weight", value: "bold" }] },
    ]);
  });

  it("an empty or comment-only text is fine", () => {
    expect(parseCss("").problems).toEqual([]);
    expect(parseCss("  /* nothing yet */ ").problems).toEqual([]);
  });

  it("unknown properties, values and parts are refused, as the backend refuses them", () => {
    expect(parseCss("heading { position: fixed }").problems).toEqual(['"position" is not a property you can set.']);
    expect(parseCss("heading { color: red }").problems).toEqual(['"red" is not a value for color.']);
    expect(parseCss("heading { font-size: 99 }").problems).toHaveLength(1);
    expect(parseCss("heading { font-size: 5 }").problems).toHaveLength(1);
    expect(parseCss("script { color: #000000 }").problems).toEqual(['"script" is not a part of the page.']);
    expect(parseCss("heading { background-color: url(javascript:x) }").problems).toHaveLength(1);
  });

  it("a rule that is not closed or not shaped like a rule is refused", () => {
    expect(parseCss("heading { color: #000000").problems).toHaveLength(1);
    expect(parseCss("heading color: #000000 }").problems).toHaveLength(1);
    expect(parseCss("heading { heading { color: #000000 } }").problems.length).toBeGreaterThan(0);
  });

  it("a very long text is refused", () => {
    expect(parseCss("heading { color: #000000 } ".repeat(400)).problems[0]).toContain("longer");
  });
});

describe("the styles the renderer gets", () => {
  it("later rules win, bold and italic are flags, and sizes are numbers", () => {
    const css = customStyles("heading { color: #111111; font-size: 12pt }\nheading { color: #222222; font-weight: bold; font-style: italic; margin-top: 6 }");
    expect(css.styles.heading).toEqual({ color: "#222222", fontSize: 12, marginTop: 6 });
    expect(css.bold.heading).toBe(true);
    expect(css.italic.heading).toBe(true);
    expect(css.styles.text).toBeUndefined();
  });

  it("an invalid rule styles nothing", () => {
    expect(customStyles("heading { color: red }").styles).toEqual({});
  });
});

describe("the part a place on the page belongs to", () => {
  it("maps page map references to the parts a rule can aim at", () => {
    expect(partOf("basics.name")).toBe("name");
    expect(partOf("basics.email")).toBe("contact");
    expect(partOf("section:abc")).toBe("heading");
    expect(partOf("entry:e1:title")).toBe("entry-title");
    expect(partOf("entry:e1:dates")).toBe("entry-dates");
    expect(partOf("entry:e1:description")).toBe("text");
    expect(partOf("role:r1:title")).toBe("entry-title");
    expect(partOf("summary")).toBe("text");
    expect(partOf("nonsense")).toBeNull();
  });
});
