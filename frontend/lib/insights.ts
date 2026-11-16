import type { components } from "@/lib/api/schema";

type Application = components["schemas"]["ApplicationResponse"];
type Entry = Application["timeline"][number];

export type Range = { from?: string; to?: string };

export type Insights = {
  /** Applications whose applied day is in the range. */
  applied: number;
  /** Of those, how many got a reply, and the share as a whole percent (null when nothing was applied to). */
  replied: number;
  replyRate: number | null;
  /** Median days from applying to the first reply (null when nobody replied). */
  medianReplyDays: number | null;
  /** How many of the applied reached each Stage or beyond, Applied first. */
  funnel: { stage: Funnel; count: number }[];
  /** Closed Applications by reason, the most common first. */
  closeReasons: { reason: NonNullable<Application["closeReason"]>; count: number }[];
};

type Funnel = "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER";
const FUNNEL: Funnel[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"];
// An employer's answer to an application: a reply is logged, the Application moved on, or it was closed by them.
const ANSWERED = new Set(["NOT_SELECTED", "ACCEPTED", "ACCEPTED_ANOTHER"]);
const DAY = 86_400_000;

const day = (iso: string) => iso.slice(0, 10);
const rank = (stage: string) => FUNNEL.indexOf(stage as Funnel);

// The days on which the employer answered: a logged reply, a move into Screening, Interview or Offer, or a close that
// was theirs. Back-dated entries count by their date.
function replyDays(application: Application) {
  const days: string[] = [];
  for (const e of application.timeline as Entry[]) {
    if (e.type === "REPLIED") days.push(day(e.at));
    else if (e.type === "STAGE" && e.stage && rank(e.stage) >= 1) days.push(day(e.at));
    else if (e.type === "STAGE" && e.stage === "CLOSED" && application.closeReason && ANSWERED.has(application.closeReason)) {
      days.push(day(e.at));
    }
  }
  return days.sort();
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Every figure is a pure function of the timelines. The set is the Applications applied to inside the range (by the
// applied day, inclusive); one never applied to is not counted anywhere.
export function insights(applications: Application[], range: Range = {}): Insights {
  const inRange = applications.filter((a) => {
    if (!a.appliedOn) return false;
    const applied = day(a.appliedOn);
    return (!range.from || applied >= range.from) && (!range.to || applied <= range.to);
  });

  const waits: number[] = [];
  let replied = 0;
  for (const a of inRange) {
    const first = replyDays(a)[0];
    if (!first) continue;
    replied++;
    waits.push(Math.max(0, Math.round((Date.parse(`${first}T00:00:00Z`) - Date.parse(`${day(a.appliedOn!)}T00:00:00Z`)) / DAY)));
  }

  const reached = (a: Application) =>
    Math.max(
      rank(a.stage),
      ...(a.timeline as Entry[]).filter((e) => e.type === "STAGE" && e.stage).map((e) => rank(e.stage!)),
    );
  const reasons = new Map<NonNullable<Application["closeReason"]>, number>();
  for (const a of inRange) if (a.closeReason) reasons.set(a.closeReason, (reasons.get(a.closeReason) ?? 0) + 1);

  return {
    applied: inRange.length,
    replied,
    replyRate: inRange.length ? Math.round((replied / inRange.length) * 100) : null,
    medianReplyDays: median(waits),
    funnel: FUNNEL.map((stage, i) => ({ stage, count: inRange.filter((a) => reached(a) >= i).length })),
    closeReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}
