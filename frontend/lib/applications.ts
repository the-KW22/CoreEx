import type { components } from "@/lib/api/schema";

export type Stage = components["schemas"]["ApplicationResponse"]["stage"];

// The six fixed Stages in the order a job normally moves through them (CONTEXT.md, Stage).
export const STAGES: { stage: Stage; label: string }[] = [
  { stage: "SAVED", label: "Saved" },
  { stage: "APPLIED", label: "Applied" },
  { stage: "SCREENING", label: "Screening" },
  { stage: "INTERVIEW", label: "Interview" },
  { stage: "OFFER", label: "Offer" },
  { stage: "CLOSED", label: "Closed" },
];

export const stageLabel = (stage: Stage) => STAGES.find((s) => s.stage === stage)?.label ?? stage;

// Day dates are stored at 12:00 UTC, so the same calendar day shows in every timezone.
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
