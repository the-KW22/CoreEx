import { describe, expect, it } from "vitest";

import { phase, storyAt, STORY_START } from "./story";

describe("storyAt", () => {
  it("is before every step while the hero copy is still leaving", () => {
    expect(storyAt(0)).toEqual({ step: -1, local: 0 });
    expect(storyAt(STORY_START - 0.01)).toEqual({ step: -1, local: 0 });
  });
  it("starts the first step where the intro ends", () => {
    expect(storyAt(STORY_START)).toEqual({ step: 0, local: 0 });
  });
  it("gives each of the four steps an equal share, with its own progress", () => {
    const length = (1 - STORY_START) / 4;
    const mid = storyAt(STORY_START + length * 1.5);
    expect(mid.step).toBe(1);
    expect(mid.local).toBeCloseTo(0.5);
    expect(storyAt(STORY_START + length * 3.25).step).toBe(3);
  });
  it("ends on the last step, finished", () => {
    expect(storyAt(1)).toEqual({ step: 3, local: 1 });
    expect(storyAt(2)).toEqual({ step: 3, local: 1 });
  });
});

describe("phase", () => {
  it("is 0 before the range, 1 after it and linear inside", () => {
    expect(phase(0.1, 0.2, 0.6)).toBe(0);
    expect(phase(0.4, 0.2, 0.6)).toBeCloseTo(0.5);
    expect(phase(0.9, 0.2, 0.6)).toBe(1);
  });
});
