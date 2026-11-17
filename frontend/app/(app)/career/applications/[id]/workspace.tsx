"use client";

import Link from "next/link";
import { useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";
import type { components } from "@/lib/api/schema";
import { formatDay } from "@/lib/applications";

import { ApplyPanel } from "./apply";
import { OutOfDate } from "./apply-question";
import { runFit } from "./career-actions";

type Library = components["schemas"]["Library"];
type Result = components["schemas"]["ResultResponse"];
type Apply = components["schemas"]["ApplyResponse"];

const TABS = ["Details", "Fit", "Apply", "Library"] as const;
type Tab = (typeof TABS)[number];

const VERDICTS = { SUPPORTED: "Supported", PARTLY: "Partly supported", MISSING: "Missing" } as const;

// The Application's workspace (ADR 0013): its details, the Fit check, the Apply tab and the Library of every AI result.
export function Workspace({
  applicationId,
  stage,
  library,
  apply,
  details,
}: {
  applicationId: string;
  stage: string;
  library: Library | null;
  apply: Apply | null;
  details: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("Details");
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
            id={`tab-${name}`}
            aria-selected={tab === name}
            aria-controls={`panel-${name}`}
            tabIndex={tab === name ? 0 : -1}
            onClick={() => setTab(name)}
            onKeyDown={(e) => move(e, index)}
            className={`-mb-px h-10 border-b-2 px-4 text-sm font-medium ${tab === name ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {name}
          </button>
        ))}
      </div>
      {TABS.map((name) => (
        <div key={name} role="tabpanel" id={`panel-${name}`} aria-labelledby={`tab-${name}`} hidden={tab !== name} className="grid gap-4">
          {name === "Details" && details}
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
          <p className="text-sm">
            <span className="text-2xl font-semibold">{latest.fit.score}</span> / 100 match
            <span className="text-muted-foreground"> (an estimate, not a measurement; read the requirements below)</span>
          </p>
          <ul className="grid gap-3">
            {latest.fit.requirements.map((r, index) => (
              <li key={index} className="grid gap-1 rounded-lg border border-border p-3">
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
                {r.verdict === "MISSING" && (
                  <>
                    <p className="text-sm text-muted-foreground">Your Knowledge doesn&apos;t show this yet.</p>
                    <Link href={`/career/knowledge?for=${encodeURIComponent(r.requirement)}`} className="text-sm font-medium underline">
                      Add evidence<span className="sr-only"> for {r.requirement}</span>
                    </Link>
                  </>
                )}
              </li>
            ))}
          </ul>
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

const KINDS: Record<string, string> = { FIT: "Fit check", DRAFT: "Draft answer", TIGHTEN: "Tightened answer" };
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
