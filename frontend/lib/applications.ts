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

export type CloseReason = NonNullable<components["schemas"]["ApplicationResponse"]["closeReason"]>;

export const CLOSE_REASONS: { reason: CloseReason; label: string }[] = [
  { reason: "ACCEPTED", label: "Accepted" },
  { reason: "NOT_SELECTED", label: "Not selected" },
  { reason: "WITHDREW", label: "Withdrew" },
  { reason: "ACCEPTED_ANOTHER", label: "Accepted another offer" },
  { reason: "NO_RESPONSE", label: "No response" },
];

export const closeReasonLabel = (reason: CloseReason) => CLOSE_REASONS.find((r) => r.reason === reason)?.label ?? reason;

export const stageLabel = (stage: Stage) => STAGES.find((s) => s.stage === stage)?.label ?? stage;

// Day dates are stored at 12:00 UTC, so the same calendar day shows in every timezone.
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export type InterviewKind = NonNullable<
  components["schemas"]["ApplicationResponse"]["timeline"][number]["kind"]
> & ("PHONE" | "VIDEO" | "ONSITE" | "OTHER");

export const INTERVIEW_KINDS: { kind: InterviewKind; label: string }[] = [
  { kind: "PHONE", label: "Phone" },
  { kind: "VIDEO", label: "Video" },
  { kind: "ONSITE", label: "Onsite" },
  { kind: "OTHER", label: "Other" },
];

export const interviewLabel = (kind: string | null) => INTERVIEW_KINDS.find((k) => k.kind === kind)?.label ?? "Other";

// An interview is stored as an exact instant. The browser's own timezone turns the User's local date and time into
// it and back, so a User away from UTC sees the time they typed.
export const toInstant = (local: string) => new Date(local).toISOString();

export function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const formatLocal = (iso: string) =>
  new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });

// A reminder's day has no zone: "2026-11-20" is that calendar day wherever the User is.
export const formatDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
