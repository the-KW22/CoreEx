import { describe, expect, it } from "vitest";

import { requestAccessError, visitorAddress } from "./request-access";

describe("requestAccessError", () => {
  it("shows the API's own message for an invalid email or a rate limit", () => {
    expect(requestAccessError(400, "Enter a valid email address.")).toBe("Enter a valid email address.");
    expect(requestAccessError(429, "Too many requests from your connection. Please try again in an hour.")).toBe(
      "Too many requests from your connection. Please try again in an hour.",
    );
  });
  it("says what to do when there is no message, or the failure is ours", () => {
    expect(requestAccessError(400)).toBe("Enter a valid email address.");
    expect(requestAccessError(500, "boom")).toBe("Could not send your request. Try again in a minute.");
    expect(requestAccessError(undefined)).toBe("Could not reach CoreEx. Check your connection and try again.");
  });
});

describe("visitorAddress", () => {
  it("takes the first address of a forwarded chain", () => {
    expect(visitorAddress("203.0.113.9, 10.0.0.1")).toBe("203.0.113.9");
  });
  it("is undefined when there is nothing usable", () => {
    expect(visitorAddress(null)).toBeUndefined();
    expect(visitorAddress("  ")).toBeUndefined();
    expect(visitorAddress("x".repeat(80))).toBeUndefined();
  });
});
