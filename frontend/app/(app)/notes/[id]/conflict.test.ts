import { describe, expect, it } from "vitest";

import { copyOf } from "./conflict";

describe("copyOf", () => {
  it("names the copy after the Note and puts the same name in its heading", () => {
    expect(copyOf({ title: "Plans", body: "# Plans\nShip it" })).toEqual({
      title: "Plans (mine)",
      body: "# Plans (mine)\nShip it",
    });
  });

  it("puts a heading in front of a text that has none", () => {
    expect(copyOf({ title: "Plans", body: "just words" })).toEqual({
      title: "Plans (mine)",
      body: "# Plans (mine)\njust words",
    });
  });

  it("calls an untitled Note Untitled", () => {
    expect(copyOf({ title: "  ", body: "words" }).title).toBe("Untitled (mine)");
  });

  it("cuts a long title so the whole name stays within 200 characters", () => {
    const copy = copyOf({ title: "x".repeat(200), body: "" });
    expect(copy.title).toHaveLength(200);
    expect(copy.title.endsWith("x (mine)")).toBe(true);
  });

  it("does not leave half of an emoji when it cuts", () => {
    const copy = copyOf({ title: "x".repeat(192) + "😀", body: "" });
    expect(copy.title).toBe("x".repeat(192) + " (mine)");
  });
});
