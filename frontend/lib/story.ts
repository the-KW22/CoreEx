// The scroll story of the marketing page (docs/DESIGN.md 6.15): the whole pinned section's progress (0 to 1) is an intro,
// where the hero copy leaves and the window settles, then four equal steps, each with a progress of its own.
export const STORY_STEPS = ["Write", "Keep", "Connect", "Ask"] as const;
export const STORY_START = 0.2;

// 0 before `from`, 1 after `to`, linear between.
export const phase = (p: number, from: number, to: number) => Math.min(1, Math.max(0, (p - from) / (to - from)));

// Which step a section progress is in (-1 during the intro) and how far through that step it is.
export function storyAt(p: number): { step: number; local: number } {
  if (p < STORY_START) return { step: -1, local: 0 };
  const count = STORY_STEPS.length;
  const scaled = Math.min(1, (p - STORY_START) / (1 - STORY_START)) * count;
  const step = Math.min(count - 1, Math.floor(scaled));
  return { step, local: scaled - step };
}
