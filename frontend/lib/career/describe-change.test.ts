import { describe, expect, it } from "vitest";

import { describeChange } from "./describe-change";

describe("describing a proposed change", () => {
  it("names the Stage it moves to", () => {
    expect(describeChange({ type: "STAGE", stage: "INTERVIEW" })).toBe("Move to Interview");
  });

  it("says why a Closed Stage closed", () => {
    expect(describeChange({ type: "STAGE", stage: "CLOSED", closeReason: "NOT_SELECTED" })).toBe("Move to Closed: Not selected");
  });

  it("gives a follow-up reminder its day and time", () => {
    expect(describeChange({ type: "FOLLOW_UP", date: "2026-12-12", time: "09:00" })).toBe("Set a follow-up reminder for Dec 12, 2026 at 09:00");
  });

  it("lists the offer's pay and reply date", () => {
    const offer = { basePay: 60000, currency: "EUR", payPeriod: "YEAR", respondBy: "2026-12-01" };
    expect(describeChange({ type: "OFFER", offer })).toBe("Save Offer terms: 60,000 EUR per year, reply by Dec 1, 2026");
  });

  it("says only what the offer has", () => {
    expect(describeChange({ type: "OFFER", offer: { respondBy: "2026-12-01" } })).toBe("Save Offer terms: reply by Dec 1, 2026");
    expect(describeChange({ type: "OFFER", offer: {} })).toBe("Save Offer terms");
  });
});
