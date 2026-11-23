// Money for the Chat budget, in dollars with two decimals.
export const formatMoney = (dollars: number) => `$${dollars.toFixed(2)}`;

// How much of the daily budget is used, 0 to 100. A zero budget counts as used up.
export function usagePercent(spent: number, budget: number): number {
  if (budget <= 0) return 100;
  return Math.min(100, Math.round((spent / budget) * 100));
}

// Time until the budget starts again, rounded up to whole minutes; "now" once that time has passed.
export function untilReset(resetsAt: string, now: number): string {
  const ms = Date.parse(resetsAt) - now;
  if (ms <= 0) return "now";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
}
