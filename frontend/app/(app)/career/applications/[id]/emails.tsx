"use client";

import { useId, useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatLocal, interviewLabel } from "@/lib/applications";
import { mailtoLink } from "@/lib/career/mailto";

import { OutOfDate } from "./apply-question";
import { AttachmentDownloads } from "./attachment-downloads";
import { draftEmail, saveEmailEdit } from "./email-actions";
import { useHydrated } from "./interviews";

type Library = components["schemas"]["Library"];
type Result = components["schemas"]["ResultResponse"];
type Entry = components["schemas"]["TimelineEntryResponse"];
type Debrief = components["schemas"]["DebriefResponse"];
type Linked = components["schemas"]["LinkedDocument"];
type NextStep = components["schemas"]["NextStepResponse"];
type EmailKind = components["schemas"]["EmailRequest"]["kind"];

const EMAIL_KINDS = ["EMAIL", "FOLLOW_UP", "THANK_YOU"];
const TITLES: Record<string, string> = { EMAIL: "Application email", FOLLOW_UP: "Follow-up", THANK_YOU: "Thank-you" };
const EVIDENCE: Record<string, string> = { FACT: "Fact", STORY: "Story" };
const ATTACH: Record<string, string> = { RESUME: "Resume", COVER_LETTER: "Cover Letter" };
const field = "h-9 rounded-lg border border-border bg-surface px-3";

// The Emails tab: drafts of the emails the User sends an employer. CoreEx never sends them; the User copies or opens them.
export function EmailsPanel({
  applicationId,
  library,
  timeline,
  debriefs,
  linked,
  nextStep,
  applied,
}: {
  applicationId: string;
  library: Library;
  timeline: Entry[];
  debriefs: Debrief[];
  linked: Linked[] | null;
  nextStep: NextStep;
  applied: boolean;
}) {
  const hydrated = useHydrated();
  const [now] = useState(() => Date.now());
  const ids = useId();
  const [error, setError] = useState("");
  const [thankSeq, setThankSeq] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const followUpDue = nextStep.due && (nextStep.kind === "NO_REPLY" || nextStep.kind === "FOLLOW_UP_DUE");
  // Past interviews that have a Debrief to thank the interviewer from. "Past" depends on the clock, so none are listed before hydration.
  const thanks = hydrated
    ? timeline
        .filter((e) => e.type === "INTERVIEW" && Date.parse(e.at) <= now && debriefs.some((d) => d.interviewSeq === e.seq))
        .sort((a, b) => b.at.localeCompare(a.at))
    : [];
  const thank = thanks.find((e) => e.seq === thankSeq) ?? thanks[0];
  const results = library.results.filter((r) => EMAIL_KINDS.includes(r.kind) && r.email);

  const draft = (kind: EmailKind, interviewSeq?: number) =>
    start(async () => {
      const result = await draftEmail(applicationId, kind, interviewSeq);
      setError(result.ok ? "" : result.message);
    });

  return (
    <section aria-labelledby="emails-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="emails-heading" className="text-lg font-semibold">Emails</h2>
        <p className="text-sm text-muted-foreground">
          Drafts of the emails you send an employer. CoreEx never sends them: copy the text, or open it in your mail app.
        </p>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => draft("APPLICATION")} aria-describedby={`${ids}-application-sends`}>
            Draft application email
          </Button>
          <p id={`${ids}-application-sends`} className="text-sm text-muted-foreground">{library.sends.EMAIL}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={pending || !applied} onClick={() => draft("FOLLOW_UP")} aria-describedby={`${ids}-follow-sends`}>
            Draft follow-up
          </Button>
          <p id={`${ids}-follow-sends`} className="text-sm text-muted-foreground">{library.sends.FOLLOW_UP}</p>
        </div>
        {!applied && <p className="text-sm text-muted-foreground">Mark this Application as applied first.</p>}
        {followUpDue && (
          <p className="rounded-lg border border-foreground px-3 py-2 text-sm font-medium">
            {nextStep.kind === "NO_REPLY" ? nextStep.label : "A follow-up is due."}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        {thanks.length > 0 ? (
          <label className="grid justify-items-start gap-1 text-sm font-medium">
            Interview for the thank-you
            <select value={thank?.seq} disabled={pending} onChange={(e) => setThankSeq(Number(e.target.value))} className={field}>
              {thanks.map((e) => (
                <option key={e.seq} value={e.seq}>
                  {`${formatLocal(e.at)}, ${interviewLabel(e.kind)}`}
                </option>
              ))}
            </select>
          </label>
        ) : (
          hydrated && <p className="text-sm text-muted-foreground">Write a Debrief for an interview first, then draft the thank-you.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending || !thank}
            onClick={() => thank && draft("THANK_YOU", thank.seq)}
            aria-describedby={`${ids}-thank-sends`}
          >
            Draft thank-you
          </Button>
          <p id={`${ids}-thank-sends`} className="text-sm text-muted-foreground">{library.sends.THANK_YOU}</p>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {/* Local times are drawn only after hydration; the list waits for it. */}
      {hydrated &&
        (results.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet. Drafts you make are kept here to edit.</p>
        ) : (
          <ul className="grid gap-4">
            {results.map((r) => (
              <EmailCard key={r.id} applicationId={applicationId} result={r} timeline={timeline} linked={linked} />
            ))}
          </ul>
        ))}
    </section>
  );
}

function EmailCard({
  applicationId,
  result,
  timeline,
  linked,
}: {
  applicationId: string;
  result: Result;
  timeline: Entry[];
  linked: Linked[] | null;
}) {
  const id = useId();
  const email = result.email;
  const [subject, setSubject] = useState(email.subject);
  const [body, setBody] = useState(email.body);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  // The server keeps the text stripped, so a difference in surrounding spaces is not an edit.
  const dirty = subject.trim() !== email.subject || body.trim() !== email.body;
  const interview = email.interviewSeq == null ? undefined : timeline.find((e) => e.type === "INTERVIEW" && e.seq === email.interviewSeq);
  const heading = interview ? `Thank-you, ${interviewLabel(interview.kind)}, ${formatLocal(interview.at)}` : TITLES[result.kind];
  const hasDocuments = linked?.some((item) => item.sentAt || item.itemId) ?? false;

  const save = () =>
    start(async () => {
      const outcome = await saveEmailEdit(applicationId, result.id, subject, body);
      setError(outcome.ok ? "" : outcome.message);
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("Could not copy. Select the text and copy it yourself.");
    }
  };

  return (
    <li className="grid gap-3 rounded-lg border border-border p-4">
      <h3 className="font-semibold">{heading}</h3>
      {result.outOfDate && <OutOfDate />}
      <div className="grid gap-1">
        <label htmlFor={`${id}-subject`} className="text-sm font-medium">Subject</label>
        <input id={`${id}-subject`} type="text" maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} className={field} />
      </div>
      <div className="grid gap-1">
        <label htmlFor={`${id}-body`} className="text-sm font-medium">Body</label>
        <textarea
          id={`${id}-body`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-40 rounded-lg border border-border bg-surface p-3 text-sm"
        />
      </div>
      <Button type="button" disabled={pending || !dirty || !subject.trim() || !body.trim()} onClick={save} className="justify-self-start">
        Save edit
      </Button>
      {email.evidence.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {email.evidence.map((e) => (
            <li key={e.id}>
              <span className="text-muted-foreground">{EVIDENCE[e.kind] ?? "Resume"}: </span>
              <q>{e.label}</q>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={copy}>
          Copy
        </Button>
        <a href={mailtoLink(subject, body)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Open in mail app
        </a>
        <span aria-live="polite" className="text-sm">{copied ? "Copied" : ""}</span>
      </div>
      {result.kind === "EMAIL" && (
        <div className="grid gap-2 border-t border-border pt-3">
          <p className="text-sm">
            {email.attach.length > 0 ? `Suggested attachments: ${email.attach.map((kind) => ATTACH[kind] ?? kind).join(", ")}` : "No attachments suggested."}
          </p>
          {linked === null ? (
            <p role="alert" className="text-sm">Could not load the documents.</p>
          ) : hasDocuments ? (
            <AttachmentDownloads linked={linked} />
          ) : (
            <p className="text-sm text-muted-foreground">No Resume or Cover Letter is linked to this Application.</p>
          )}
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </li>
  );
}
