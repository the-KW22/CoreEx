import { describe, expect, it } from "vitest";

import { formatDate, formatSpan } from "./dates";

describe("printing Resume dates", () => {
  it("prints one stored date in each format", () => {
    expect(formatDate("2021-03", "MMM_YYYY")).toBe("Mar 2021");
    expect(formatDate("2021-03", "MM_YYYY")).toBe("03/2021");
    expect(formatDate("2021-03", "YYYY_MM")).toBe("2021-03");
    expect(formatDate("2021-03", "YYYY")).toBe("2021");
  });

  it("a day is dropped, a bare year stays a year, and present is Present", () => {
    expect(formatDate("2021-03-15", "MMM_YYYY")).toBe("Mar 2021");
    expect(formatDate("2019", "MMM_YYYY")).toBe("2019");
    expect(formatDate("present", "MM_YYYY")).toBe("Present");
    expect(formatDate(" Present ", "YYYY")).toBe("Present");
  });

  it("text that is not a date, or a month out of range, is not lost or invented", () => {
    expect(formatDate("Summer 2020", "MMM_YYYY")).toBe("Summer 2020");
    expect(formatDate("2021-13", "MMM_YYYY")).toBe("2021");
    expect(formatDate("", "MMM_YYYY")).toBe("");
  });

  it("a span joins start and end and leaves out what is empty", () => {
    expect(formatSpan("2021-03", "present", "MMM_YYYY")).toBe("Mar 2021 - Present");
    expect(formatSpan("2018-06", "2021-02", "MM_YYYY")).toBe("06/2018 - 02/2021");
    expect(formatSpan("2018", "", "MMM_YYYY")).toBe("2018");
    expect(formatSpan("", "", "MMM_YYYY")).toBe("");
  });
});
