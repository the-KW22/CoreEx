export type LimitUnit = "WORDS" | "CHARS";

// The same rules as the backend's AnswerLimits: trim first, then count words or code points.
export function countAnswer(unit: LimitUnit, text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  return unit === "WORDS" ? trimmed.split(/\s+/).length : [...trimmed].length;
}

export function overLimit(unit: LimitUnit | null, limit: number | null, text: string): boolean {
  if (unit === null || limit === null) return false;
  return countAnswer(unit, text) > limit;
}
