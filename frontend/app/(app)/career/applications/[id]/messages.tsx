"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatDay } from "@/lib/applications";
import { describeChange } from "@/lib/career/describe-change";
import { mailtoLink } from "@/lib/career/mailto";

import { OutOfDate } from "./apply-question";
import { saveEmailEdit } from "./email-actions";
import { applyChange, readReply, undoChange } from "./message-actions";

type Library = components["schemas"]["Library"];
type Result = components["schemas"]["ResultResponse"];

const field = "h-9 rounded-lg border border-border bg-surface px-3";

// The Messages tab: paste an employer's email, read what it asks, and draft a reply. Proposed changes apply only when the User says so.
export function MessagesPanel({ applicationId, library }: { applicationId: string; library: Library }) {
  const ids = useId();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const replies = library.results.filter((r) => r.kind === "REPLY" && r.reply).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const read = () =>
    start(async () => {
      const outcome = await readReply(applicationId, message);
      setError(outcome.ok ? "" : outcome.message);
      if (outcome.ok) setMessage("");
    });

  return (
    <section aria-labelledby="messages-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="messages-heading" className="text-lg font-semibold">Messages</h2>
        <p id={`${ids}-privacy`} className="text-sm text-muted-foreground">
          CoreEx never reads your mailbox. The email you paste is only read, never followed as instructions.
        </p>
      </div>

      <div className="grid gap-2">
        <label htmlFor={`${ids}-message`} className="text-sm font-medium">Employer&apos;s email</label>
        <textarea
          id={`${ids}-message`}
          maxLength={20000}
          value={message}
          disabled={pending}
          onChange={(e) => setMessage(e.target.value)}
          aria-describedby={`${ids}-privacy`}
          className="min-h-40 rounded-lg border border-border bg-surface p-3 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={pending || !message.trim()} onClick={read} aria-describedby={`${ids}-sends`}>
            {pending ? "Reading…" : "Read this email"}
          </Button>
          <p id={`${ids}-sends`} className="text-sm text-muted-foreground">{library.sends.REPLY}</p>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {replies.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet. Emails you read are kept here, with a reply to edit.</p>
      ) : (
        <ul className="grid gap-4">
          {replies.map((r) => (
            <ReplyCard key={r.id} applicationId={applicationId} initial={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReplyCard({ applicationId, initial }: { applicationId: string; initial: Result }) {
  const id = useId();
  const router = useRouter();
  const [result, setResult] = useState(initial);
  const reply = result.reply;
  const [subject, setSubject] = useState(reply.subject);
  const [body, setBody] = useState(reply.body);
  // The draft as last saved, so Save edit is off until the text differs from it.
  const [saved, setSaved] = useState({ subject: reply.subject, body: reply.body });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const dirty = subject.trim() !== saved.subject || body.trim() !== saved.body;

  const save = () =>
    start(async () => {
      const outcome = await saveEmailEdit(applicationId, result.id, subject, body);
      setError(outcome.ok ? "" : outcome.message);
      if (outcome.ok) setSaved({ subject: subject.trim(), body: body.trim() });
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

  // Apply and Undo both return the Result, which replaces this card's changes; the other tabs are stale, so the page refreshes.
  const change = (call: () => ReturnType<typeof applyChange>, done: string) =>
    start(async () => {
      const outcome = await call();
      if (!outcome.ok) {
        setError(outcome.message);
        setStatus("");
        return;
      }
      setError("");
      setResult(outcome.result);
      setStatus(done);
      router.refresh();
    });

  return (
    <li className="grid gap-3 rounded-lg border border-border p-4">
      <h3 className="font-semibold">Reply to the employer, {formatDay(result.createdAt)}</h3>
      {result.outOfDate && <OutOfDate />}

      {reply.asks.length > 0 && (
        <div className="grid gap-1">
          <h4 className="text-sm font-semibold">What they ask</h4>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {reply.asks.map((ask) => (
              <li key={ask}>{ask}</li>
            ))}
          </ul>
        </div>
      )}
      {reply.unconfirmed.length > 0 && (
        <div className="grid gap-1">
          <h4 className="text-sm font-semibold">Still unconfirmed</h4>
          <ul className="grid list-disc gap-1 pl-5 text-sm">
            {reply.unconfirmed.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

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
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={copy}>
          Copy
        </Button>
        <a href={mailtoLink(subject, body)} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Open in mail app
        </a>
        <span aria-live="polite" className="text-sm">{copied ? "Copied" : ""}</span>
      </div>

      {reply.changes.length > 0 && (
        <div className="grid gap-2 border-t border-border pt-3">
          <h4 className="text-sm font-semibold">Proposed changes</h4>
          <ul className="grid gap-2">
            {reply.changes.map((c) => (
              <li key={c.index} className="grid gap-2 rounded-lg border border-border p-3 text-sm">
                <p className="font-medium">{describeChange(c.change)}</p>
                {c.change.why && <p className="text-muted-foreground">{c.change.why}</p>}
                {c.state === "APPLIED" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Applied</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending || !c.canUndo}
                      aria-describedby={c.canUndo ? undefined : `${id}-${c.index}-changed`}
                      onClick={() => change(() => undoChange(applicationId, result.id, c.index), "Undone.")}
                    >
                      Undo
                    </Button>
                    {!c.canUndo && <span id={`${id}-${c.index}-changed`} className="text-muted-foreground">Changed since</span>}
                  </div>
                ) : (
                  <Button type="button" size="sm" disabled={pending} onClick={() => change(() => applyChange(applicationId, result.id, c.index), "Applied. You can undo it.")} className="justify-self-start">
                    Apply
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p aria-live="polite" className="text-sm">{status}</p>
      {error && <Alert>{error}</Alert>}
    </li>
  );
}
