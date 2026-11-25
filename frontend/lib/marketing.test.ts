import { describe, expect, it } from "vitest";

import { marketingRewrite } from "./marketing";

describe("marketingRewrite", () => {
  it("sends a signed-out visitor at / to the marketing page", () => {
    expect(marketingRewrite("/", false)).toBe("/welcome");
  });
  it("leaves Home for a signed-in User", () => {
    expect(marketingRewrite("/", true)).toBeNull();
  });
  it("leaves every other path alone", () => {
    expect(marketingRewrite("/items", false)).toBeNull();
    expect(marketingRewrite("/welcome", false)).toBeNull();
  });
});
