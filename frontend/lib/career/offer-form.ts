import type { components } from "@/lib/api/schema";

export type Terms = components["schemas"]["TermsResponse"];
export type OfferRequest = components["schemas"]["OfferRequest"];
export type Check = components["schemas"]["Check"];

// The form's boxes as text, so an empty box (unknown) stays apart from a typed 0.
export type OfferFormValues = {
  basePay: string;
  currency: string;
  payPeriod: string;
  bonus: string;
  equity: string;
  benefits: string;
  startDate: string;
  place: string;
  officeDays: string;
  respondBy: string;
};

export const emptyOfferForm: OfferFormValues = {
  basePay: "",
  currency: "",
  payPeriod: "",
  bonus: "",
  equity: "",
  benefits: "",
  startDate: "",
  place: "",
  officeDays: "",
  respondBy: "",
};

export const PAY_PERIODS = [
  { value: "YEAR", label: "Per year" },
  { value: "MONTH", label: "Per month" },
  { value: "HOUR", label: "Per hour" },
] as const;

// shortcut: a check code without a label shows the API's own message, add a label when the API adds a code.
const CHECK_LABELS: Record<string, string> = {
  BELOW_MINIMUM_PAY: "Below your minimum pay",
};

export const checkLabel = (check: Check) => CHECK_LABELS[check.code ?? ""] ?? check.message ?? check.code ?? "Flagged";

export const payPeriodLabel = (period: string | null | undefined) =>
  PAY_PERIODS.find((p) => p.value === period)?.label ?? "Not set";

// The box text for a saved term: a null term is an empty box, so a saved Offer reads the same way it was typed.
export function formFromTerms(terms: Terms): OfferFormValues {
  return {
    basePay: terms.basePay == null ? "" : String(terms.basePay),
    currency: terms.currency ?? "",
    payPeriod: terms.payPeriod ?? "",
    bonus: terms.bonus ?? "",
    equity: terms.equity ?? "",
    benefits: terms.benefits ?? "",
    startDate: terms.startDate ?? "",
    place: terms.place ?? "",
    officeDays: terms.officeDays == null ? "" : String(terms.officeDays),
    respondBy: terms.respondBy ?? "",
  };
}

const blank = (text: string) => (text.trim() === "" ? null : text.trim());

// The request body for the form. An empty box is sent as null, never 0 or "". Returns the first problem as a sentence.
export function offerRequestFrom(form: OfferFormValues, version: number | null = null): { body: OfferRequest } | { error: string } {
  const pay = blank(form.basePay);
  const basePay = pay === null ? null : Number(pay);
  if (basePay !== null && (!Number.isFinite(basePay) || basePay < 0)) return { error: "Base pay must be a number, 0 or more." };

  const currency = blank(form.currency)?.toUpperCase() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) return { error: "Currency is three letters, such as GBP." };

  const days = blank(form.officeDays);
  const officeDays = days === null ? null : Number(days);
  if (officeDays !== null && (!Number.isInteger(officeDays) || officeDays < 0 || officeDays > 5)) {
    return { error: "Office days per week is a whole number from 0 to 5." };
  }

  return {
    body: {
      basePay,
      currency,
      payPeriod: blank(form.payPeriod),
      bonus: blank(form.bonus),
      equity: blank(form.equity),
      benefits: blank(form.benefits),
      startDate: blank(form.startDate),
      place: blank(form.place),
      officeDays,
      respondBy: blank(form.respondBy),
      version,
    },
  };
}
