"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";

import { Alert } from "@/components/alert";
import { Badge } from "@/components/badge";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatDay } from "@/lib/applications";

import { ApplyPanel, MarkApplied } from "./apply";
import { OutOfDate } from "./apply-question";
import { runFit } from "./career-actions";
import { DebriefPanel } from "./debrief";
import { EmailsPanel } from "./emails";
import { InterviewPrep } from "./interview-prep";
import { MessagesPanel } from "./messages";
import { PracticePanel } from "./practice";

type Library = components["schemas"]["Library"];
type Result = components["schemas"]["ResultResponse"];
type Apply = components["schemas"]["ApplyResponse"];
type Timeline = components["schemas"]["TimelineEntryResponse"][];
type Debrief = components["schemas"]["DebriefResponse"];
type Linked = components["schemas"]["LinkedDocument"];
type NextStep = components["schemas"]["NextStepResponse"];

const ALL_TABS = ["Details", "Fit", "Apply", "Emails", "Messages", "Interview prep", "Practice", "Debrief", "Library"] as const;
type Tab = (typeof ALL_TABS)[number];

// The tabs shown (#366): the flow is the job description, the Fit check, the email and the interview. The others are hidden,
// not deleted: their panels, API and data stay, and adding a name here brings its tab back. Mark as applied, which lived in
// Apply, now sits at the bottom of Details.
const SHOWN: readonly Tab[] = ["Details", "Fit", "Emails", "Interview prep"];
const TABS = ALL_TABS.filter((name) => SHOWN.includes(name));

// Ids cannot hold spaces, so "Interview prep" becomes "Interview-prep" in its tab and panel ids.
const slug = (name: Tab) => name.replace(/ /g, "-");

const VERDICTS = { SUPPORTED: "Supported", PARTLY: "Partly supported", MISSING: "Missing" } as const;

// The Application's workspace (ADR 0013): its details, the Fit check, the Apply tab, the interview tabs and the Library of every AI result.
export function Workspace({
  applicationId,
  stage,
  library,
  apply,
  timeline,
  debriefs,
  linked,
  nextStep,
  appliedOn,
  initialTab,
  initialInterview,
  details,
}: {
  applicationId: string;
  stage: string;
  library: Library | null;
  apply: Apply | null;
  timeline: Timeline;
  debriefs: Debrief[] | null;
  linked: Linked[] | null;
  nextStep: NextStep;
  appliedOn: string | null;
  // From the address (?tab=, ?interview=, as Today links to them): an unknown tab name is ignored.
  initialTab?: string;
  initialInterview?: number;
  details: ReactNode;
}) {
  const router = useRouter();
  const [tab, setTabState] = useState<Tab>(() => TABS.find((t) => t === initialTab) ?? "Details");
  // The interview tabs read the interviews added in Details, which that tab keeps in its own state: refresh the page data on opening one.
  const setTab = (next: Tab) => {
    setTabState(next);
    if (next === "Interview prep" || next === "Practice" || next === "Debrief" || next === "Emails") router.refresh();
  };
  // Held here so the Interview prep tab can fill the Practice tab's question before it opens.
  const [practiceQuestion, setPracticeQuestion] = useState("");
  const practise = (question: string) => {
    setPracticeQuestion(question);
    setTab("Practice");
  };
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (e: KeyboardEvent, index: number) => {
    const next = e.key === "ArrowRight" ? index + 1 : e.key === "ArrowLeft" ? index - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const target = TABS[(next + TABS.length) % TABS.length];
    setTab(target);
    refs.current[target]?.focus();
  };
  return (
    <div className="grid gap-4">
      <div role="tablist" aria-label="Application workspace" className="mx-auto flex w-full max-w-3xl gap-1 border-b border-border">
        {TABS.map((name, index) => (
          <button
            key={name}
            ref={(el) => {
              refs.current[name] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${slug(name)}`}
            aria-selected={tab === name}
            aria-controls={`panel-${slug(name)}`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(e) => move(e, index)}
            className={`-mb-px h-10 shrink-0 border-b-2 px-4 text-sm font-medium ${tab === name ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {name}
          </button>
        ))}
      </div>
      {TABS.map((name) => (
        <div key={name} role="tabpanel" id={`panel-${slug(name)}`} aria-labelledby={`tab-${slug(name)}`} hidden={tab !== name} className="grid gap-4">
          {name === "Details" && (
            <>
              {details}
              {apply && !SHOWN.includes("Apply") && (
                <div className="mx-auto w-full max-w-3xl">
                  <MarkApplied applicationId={applicationId} stage={stage} apply={apply} />
                </div>
              )}
            </>
          )}
          {name === "Fit" && (
            <div className="mx-auto w-full max-w-3xl">
              {library ? <FitPanel applicationId={applicationId} library={library} /> : <Alert>Could not load the results. Reload to try again.</Alert>}
            </div>
          )}
          {name === "Apply" && (
            <div className="mx-auto w-full max-w-3xl">
              {apply && library ? (
                <ApplyPanel applicationId={applicationId} stage={stage} apply={apply} library={library} />
              ) : (
                <Alert>Could not load the questions. Reload to try again.</Alert>
              )}
            </div>
          )}
          {name === "Emails" && (
            <div className="mx-auto w-full max-w-3xl">
              {library && debriefs ? (
                <EmailsPanel
                  applicationId={applicationId}
                  library={library}
                  timeline={timeline}
                  debriefs={debriefs}
                  linked={linked}
                  nextStep={nextStep}
                  applied={appliedOn !== null}
                />
              ) : (
                <Alert>Could not load the results. Reload to try again.</Alert>
              )}
            </div>
          )}
          {name === "Messages" && (
            <div className="mx-auto w-full max-w-3xl">
              {library ? <MessagesPanel applicationId={applicationId} library={library} /> : <Alert>Could not load the results. Reload to try again.</Alert>}
            </div>
          )}
          {name === "Interview prep" && (
            <div className="mx-auto w-full max-w-3xl">
              {library ? (
                <InterviewPrep applicationId={applicationId} library={library} timeline={timeline} onPractise={SHOWN.includes("Practice") ? practise : undefined} />
              ) : (
                <Alert>Could not load the results. Reload to try again.</Alert>
              )}
            </div>
          )}
          {name === "Practice" && (
            <div className="mx-auto w-full max-w-3xl">
              {library ? (
                <PracticePanel
                  applicationId={applicationId}
                  library={library}
                  question={practiceQuestion}
                  onQuestion={setPracticeQuestion}
                  interview={initialInterview}
                />
              ) : (
                <Alert>Could not load the results. Reload to try again.</Alert>
              )}
            </div>
          )}
          {name === "Debrief" && (
            <div className="mx-auto w-full max-w-3xl">
              {library && debriefs ? (
                <DebriefPanel applicationId={applicationId} library={library} timeline={timeline} debriefs={debriefs} />
              ) : (
                <Alert>Could not load the Debriefs. Reload to try again.</Alert>
              )}
            </div>
          )}
          {name === "Library" && (
            <div className="mx-auto w-full max-w-3xl">
              {library ? <LibraryPanel library={library} open={setTab} /> : <Alert>Could not load the results. Reload to try again.</Alert>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

type Requirement = components["schemas"]["RequirementResponse"];

// The label for a plan on a gap (plain text, rendered by React).
const PLANS = { FRAME: "present it truthfully", CLOSE: "close the gap fast", DO_NOT_CLAIM: "do not claim it" } as const;

// The requirement groups, in the order they show. A result made before kinds existed has none: its requirements go in one plain list.
const KIND_GROUPS = [
  { kind: "MUST", heading: "Must-haves" },
  { kind: "GATE", heading: "Hard gates" },
  { kind: "NICE", heading: "Nice-to-haves" },
] as const;

function FitPanel({ applicationId, library }: { applicationId: string; library: Library }) {
  const latest = library.results.find((r) => r.kind === "FIT" && r.fit);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const result = await runFit(applicationId);
      setError(result.ok ? "" : result.message);
    });
  return (
    <section aria-labelledby="fit-heading" className="grid gap-4">
      <div className="grid gap-1">
        <h2 id="fit-heading" className="text-lg font-semibold">Fit check</h2>
        <p className="text-sm text-muted-foreground">Each requirement in the posting, and what your Knowledge shows for it.</p>
      </div>
      <div className="grid gap-2 justify-items-start">
        <p id="fit-sends" className="text-sm text-muted-foreground">{library.sends.FIT}</p>
        <Button type="button" onClick={run} disabled={pending} aria-describedby="fit-sends">
          {pending ? "Checking…" : latest ? "Run Fit check again" : "Run Fit check"}
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
      {latest?.fit && (
        <div className="grid gap-4">
          {latest.outOfDate && <OutOfDate />}
          <div className="grid gap-1">
            <p className="text-sm">
              <span className="text-2xl font-semibold">{latest.fit.score}</span> / 100 match
              {latest.fit.points != null && latest.fit.maximum != null ? (
                <span className="block text-muted-foreground">
                  {latest.fit.points} of {latest.fit.maximum} points: a supported must-have counts 2, a partly supported 1, a nice-to-have counts half as much.
                </span>
              ) : (
                <span className="text-muted-foreground"> (an estimate, not a measurement; read the requirements below)</span>
              )}
            </p>
            {latest.fit.source === "COREEX" && <p className="text-sm text-muted-foreground">Made by CoreEx</p>}
            {latest.fit.source === "AGENT" && <p className="text-sm text-muted-foreground">Made by your agent over MCP</p>}
          </div>
          {latest.fit.priorities.length > 0 && (
            <section aria-labelledby="fit-priorities" className="grid gap-2">
              <h3 id="fit-priorities" className="font-semibold">What decides the hire</h3>
              <ul className="grid list-disc gap-1 pl-5 text-sm">
                {latest.fit.priorities.map((priority, index) => (
                  <li key={index}>{priority}</li>
                ))}
              </ul>
            </section>
          )}
          {KIND_GROUPS.map((group) => {
            const items = latest.fit.requirements.filter((r) => r.kind === group.kind);
            if (items.length === 0) return null;
            return (
              <section key={group.kind} aria-labelledby={`fit-${group.kind}`} className="grid gap-3">
                <h3 id={`fit-${group.kind}`} className="font-semibold">{group.heading}</h3>
                <ul className="grid gap-3">
                  {items.map((r) => (
                    <RequirementItem key={latest.fit.requirements.indexOf(r)} requirement={r} />
                  ))}
                </ul>
              </section>
            );
          })}
          {latest.fit.requirements.some((r) => !r.kind) && (
            <ul className="grid gap-3">
              {latest.fit.requirements
                .filter((r) => !r.kind)
                .map((r) => (
                  <RequirementItem key={latest.fit.requirements.indexOf(r)} requirement={r} />
                ))}
            </ul>
          )}
          {latest.fit.keywords.length > 0 && <KeywordsRow keywords={latest.fit.keywords} />}
          {latest.fit.question && (
            <p className="text-sm">
              <span className="font-medium">A question to ask: </span>
              {latest.fit.question}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function RequirementItem({ requirement: r }: { requirement: Requirement }) {
  const planLabel = r.verdict !== "SUPPORTED" && r.plan && r.plan !== "NONE" ? PLANS[r.plan] : null;
  return (
    <li className="grid gap-1 rounded-lg border border-border p-3">
      <p className="font-medium">
        <span className="mr-2 rounded-md border border-border px-1.5 py-0.5 text-xs font-semibold">{VERDICTS[r.verdict]}</span>
        {r.requirement}
      </p>
      {r.note && <p className="text-sm text-muted-foreground">{r.note}</p>}
      {r.evidence.length > 0 && (
        <ul className="grid gap-1 text-sm">
          {r.evidence.map((e) => (
            <li key={e.id}>
              <span className="text-muted-foreground">{e.kind === "FACT" ? "Fact" : e.kind === "STORY" ? "Story" : "Resume"}: </span>
              <q>{e.label}</q>
            </li>
          ))}
        </ul>
      )}
      {planLabel && (
        <p className="text-sm">
          <span className="font-medium">How to handle it: </span>
          {planLabel}.{r.planNote && ` ${r.planNote}`}
        </p>
      )}
      {r.confirm && (
        <p className="text-sm font-medium">
          <span>Confirm before applying: </span>
          {r.confirm}
        </p>
      )}
      {r.verdict === "MISSING" && (
        <>
          <p className="text-sm text-muted-foreground">Your Knowledge doesn&apos;t show this yet.</p>
          <Link href={`/career/knowledge?for=${encodeURIComponent(r.requirement)}`} className="text-sm font-medium underline">
            Add evidence<span className="sr-only"> for {r.requirement}</span>
          </Link>
        </>
      )}
    </li>
  );
}

// The posting's keywords as chips, copied comma-separated for an email or a Cover Letter.
function KeywordsRow({ keywords }: { keywords: string[] }) {
  const [status, setStatus] = useState<"" | "copied" | "failed">("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(keywords.join(", "));
      setStatus("copied");
      setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("failed");
    }
  };
  return (
    <section aria-labelledby="fit-keywords" className="grid gap-2">
      <h3 id="fit-keywords" className="font-semibold">Keywords from the posting</h3>
      <ul className="flex flex-wrap gap-2">
        {keywords.map((keyword, index) => (
          <li key={index}>
            <Badge>{keyword}</Badge>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {status === "copied" ? "Copied" : "Copy keywords"}
        </Button>
        {status === "failed" && <span className="text-sm">Could not copy. Select the keywords and copy them yourself.</span>}
      </div>
    </section>
  );
}

const KINDS: Record<string, string> = {
  FIT: "Fit check",
  DRAFT: "Draft answer",
  TIGHTEN: "Tightened answer",
  PREP: "Interview prep",
  PRACTICE: "Practice attempt",
  DEBRIEF: "Debrief summary",
};
const STATUS: Record<string, string> = { ACCEPTED: "Accepted", REJECTED: "Rejected" };

// The first ~80 characters of a proposed answer, so the Library says what it is without opening it.
const preview = (text: string) => (text.length > 80 ? `${text.slice(0, 80)}…` : text);

function LibraryPanel({ library, open }: { library: Library; open: (tab: Tab) => void }) {
  return (
    <section aria-labelledby="library-heading" className="grid gap-4">
      <h2 id="library-heading" className="text-lg font-semibold">Library</h2>
      {library.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet. What the AI makes for this Application is kept here.</p>
      ) : (
        <ul className="grid gap-2">
          {library.results.map((r: Result) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-medium">{KINDS[r.kind] ?? r.kind}</span>
              {r.fit && <span>{r.fit.score} / 100 (estimate)</span>}
              {r.answer && <span>{preview(r.answer.text)}</span>}
              {r.kind === "PRACTICE" && <span>{preview(r.practice.question)}</span>}
              {r.kind === "DEBRIEF" && r.summary.improve[0] && <span>{preview(r.summary.improve[0])}</span>}
              {r.answer && (
                <span className="rounded-md border border-border px-1.5 py-0.5 text-xs font-semibold">
                  {r.resolution ? (STATUS[r.resolution] ?? r.resolution) : "Waiting"}
                </span>
              )}
              <span className="text-muted-foreground">{formatDay(r.createdAt)}</span>
              {r.outOfDate && <span className="rounded-md border border-border px-1.5 py-0.5 text-xs font-semibold">Out of date</span>}
              {r.kind === "FIT" && (
                <button type="button" onClick={() => open("Fit")} className="ml-auto font-medium underline">
                  Open Fit check
                </button>
              )}
              {r.answer && (
                <button type="button" onClick={() => open("Apply")} className="ml-auto font-medium underline">
                  Open Apply
                </button>
              )}
              {r.kind === "PREP" && (
                <button type="button" onClick={() => open("Interview prep")} className="ml-auto font-medium underline">
                  Open Interview prep
                </button>
              )}
              {r.kind === "PRACTICE" && (
                <button type="button" onClick={() => open("Practice")} className="ml-auto font-medium underline">
                  Open Practice
                </button>
              )}
              {r.kind === "DEBRIEF" && (
                <button type="button" onClick={() => open("Debrief")} className="ml-auto font-medium underline">
                  Open Debrief
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
