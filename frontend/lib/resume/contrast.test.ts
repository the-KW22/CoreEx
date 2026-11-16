import { describe, expect, it } from "vitest";

import { accentContrast, contrastRatio, luminance } from "./contrast";

describe("the accent colour's contrast", () => {
  it("black on white is 21 to 1 and a colour on itself is 1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1d4ed8", "#1d4ed8")).toBeCloseTo(1, 5);
    expect(luminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("the order of the two colours does not matter", () => {
    expect(contrastRatio("#ffffff", "#767676")).toBeCloseTo(contrastRatio("#767676", "#ffffff"), 8);
  });

  it("the default blue passes and a pale yellow does not", () => {
    expect(accentContrast("#1d4ed8", "classic").ok).toBe(true);
    const pale = accentContrast("#ffe066", "classic");
    expect(pale.ok).toBe(false);
    expect(pale.ratio).toBeLessThan(2);
  });

  it("the grey 767676 is the lightest grey that passes on white", () => {
    expect(accentContrast("#767676", "classic").ok).toBe(true);
    expect(accentContrast("#777777", "classic").ok).toBe(false);
  });

  it("knows when the accent is a header band", () => {
    expect(accentContrast("#1d4ed8", "modern").onBand).toBe(true);
    expect(accentContrast("#1d4ed8", "sidebar").onBand).toBe(false);
  });
});
