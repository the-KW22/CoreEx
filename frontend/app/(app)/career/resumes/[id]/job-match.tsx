"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { resumeBlocks } from "@/lib/resume/blocks";
import { jobMatch } from "@/lib/resume/job-match";
import { segmentsOf } from "@/lib/resume/page-map";
import type { ResumeDocument } from "./store";
import { applicationsForMatch } from "./actions";

export function JobMatch({ doc, locked, ignore }: { doc: ResumeDocument; locked: boolean; ignore: (id: string, ignored: boolean) => void }) {
  const [applications, setApplications] = useState<Awaited<ReturnType<typeof applicationsForMatch>> | undefined>();
  const [selected, setSelected] = useState("");
  useEffect(() => { void applicationsForMatch().then(setApplications).catch(() => setApplications(null)); }, []);
  const application = applications?.find((item) => item.id === selected);
  const prefix = `job:${selected}:`;
  const matches = useMemo(() => jobMatch(application?.postingText ?? "", segmentsOf(resumeBlocks(doc)).map((s) => s.text).join(" "), doc.ignoredChecks.filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length))), [application, doc, prefix]);
  return <section aria-labelledby="job-match-heading" className="grid gap-3 border-t border-border pt-4">
    <h3 id="job-match-heading" className="font-semibold">Compare with a job</h3>
    <p className="text-sm text-muted-foreground">Keywords are suggestions based on the posting, not a measure of fit. Only include what is true for you.</p>
    {applications === null ? <p role="alert">Could not load Applications.</p> : applications === undefined ? <p>Loading Applications…</p> : <>
      <label htmlFor="match-application">Application</label>
      <select id="match-application" className="h-9 rounded-lg border border-border bg-surface px-2" value={selected} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Choose an Application</option>
        {applications.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.company}</option>)}
      </select>
      {application && (!application.postingText.trim() ? <p>This Application has no posting text.</p> : <ul className="grid gap-2">
        {matches.map((match) => <li key={match.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{match.word} · {match.covered ? "Covered" : match.excluded ? "Not true for me" : "Missing"}</span>
          {!match.covered && <Button type="button" size="sm" variant="outline" disabled={locked} onClick={() => ignore(prefix + match.id, !match.excluded)}>{match.excluded ? "Undo" : "Not true for me"}</Button>}
        </li>)}
      </ul>)}
    </>}
  </section>;
}
