import { describe, expect, it } from "vitest";

import { checkLabel, emptyOfferForm, formFromTerms, offerRequestFrom, payPeriodLabel } from "./offer-form";

describe("sending an Offer", () => {
  it("sends every empty box as null, never 0 or an empty string", () => {
    const result = offerRequestFrom({ ...emptyOfferForm, bonus: "   " });
    expect(result).toEqual({
      body: {
        basePay: null,
        currency: null,
        payPeriod: null,
        bonus: null,
        equity: null,
        benefits: null,
        startDate: null,
        place: null,
        officeDays: null,
        respondBy: null,
        version: null,
      },
    });
  });

  it("keeps a typed zero as zero", () => {
    const result = offerRequestFrom({ ...emptyOfferForm, basePay: "0", officeDays: "0" });
    expect(result).toMatchObject({ body: { basePay: 0, officeDays: 0 } });
  });

  it("uppercases the currency and sends the version seen", () => {
    const result = offerRequestFrom({ ...emptyOfferForm, currency: "usd", basePay: "90000", payPeriod: "YEAR" }, 3);
    expect(result).toMatchObject({ body: { currency: "USD", basePay: 90000, payPeriod: "YEAR", version: 3 } });
  });

  it("refuses a currency that is not three letters", () => {
    expect(offerRequestFrom({ ...emptyOfferForm, currency: "US" })).toEqual({ error: "Currency is three letters, such as GBP." });
  });

  it("refuses office days outside 0 to 5 or not whole", () => {
    expect(offerRequestFrom({ ...emptyOfferForm, officeDays: "6" })).toHaveProperty("error");
    expect(offerRequestFrom({ ...emptyOfferForm, officeDays: "2.5" })).toHaveProperty("error");
  });

  it("refuses a negative base pay", () => {
    expect(offerRequestFrom({ ...emptyOfferForm, basePay: "-1" })).toHaveProperty("error");
  });
});

describe("showing a saved Offer", () => {
  it("turns a null term back into an empty box", () => {
    const form = formFromTerms({
      basePay: 0,
      currency: null,
      payPeriod: null,
      bonus: null,
      equity: null,
      benefits: null,
      startDate: null,
      place: null,
      officeDays: 0,
      respondBy: null,
    });
    expect(form).toMatchObject({ basePay: "0", officeDays: "0", currency: "", bonus: "" });
  });

  it("labels a missing pay period as Not set and a check by its code", () => {
    expect(payPeriodLabel(null)).toBe("Not set");
    expect(payPeriodLabel("MONTH")).toBe("Per month");
    expect(checkLabel({ code: "BELOW_MINIMUM_PAY", message: "x" })).toBe("Below your minimum pay");
    expect(checkLabel({ code: "NEW_THING", message: "Something new" })).toBe("Something new");
  });
});
