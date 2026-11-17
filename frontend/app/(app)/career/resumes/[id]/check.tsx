"use client";

import { Button } from "@/components/ui/button";
import type { CheckIssue } from "@/lib/resume/check";

export function Check({ score, issues, locked, select, ignore, fix }: {
  score: number; issues: CheckIssue[]; locked: boolean; select: (ref: string) => void;
  ignore: (id: string, ignored: boolean) => void; fix: (issue: CheckIssue) => void;
}) {
  return <section aria-labelledby="check-heading" className="grid content-start gap-4">
    <h2 id="check-heading" className="text-lg font-semibold">Check</h2>
    <p>Score: {score} / 100</p>
    <p className="text-sm text-muted-foreground">These checks suggest changes; they cannot predict hiring decisions.</p>
    {issues.length === 0 ? <p>Nothing to fix.</p> : <ul className="grid gap-3">
      {issues.map((issue) => <li key={issue.id} className="grid gap-2 rounded-lg border border-border p-3">
        <p className="text-sm font-medium">{issue.category} · {issue.severity === "error" ? "Error" : "Suggestion"}{issue.ignored ? " · Ignored" : ""}</p>
        <p>{issue.message}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => select(issue.ref)}>{issue.ref === "design" ? "Open design" : "Edit field"}</Button>
          {issue.fix && !issue.ignored && <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => fix(issue)}>Use 9 pt</Button>}
          <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => ignore(issue.id, !issue.ignored)}>{issue.ignored ? "Show again" : "Ignore"}</Button>
        </div>
      </li>)}
    </ul>}
  </section>;
}
