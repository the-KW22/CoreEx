"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { parseRich } from "@/lib/resume/html";
import { decideReview, resumeReviews, reviewResume, type Loaded, type Review } from "./actions";
import type { ResumeDocument } from "./store";

export function matchingReview(review: Review, doc: ResumeDocument): Review {
  const fields = new Map<string, string>([["summary", doc.summary]]);
  for (const section of doc.sections) for (const entry of section.entries) {
    fields.set(`entry:${entry.id}:description`, entry.description);
    for (const role of entry.roles) fields.set(`role:${role.id}:description`, role.description);
  }
  return { ...review, suggestions: review.suggestions.filter((item) => fields.get(item.field) === item.original) };
}

const plain = (html: string) => parseRich(html).map((block) => block.kind === "paragraph" ? block.runs.map((r) => r.text).join("") : block.items.map((item) => item.map((r) => r.text).join("")).join("\n")).join("\n");

export function AiReview({ id, version, ready, doc, reviews, setReviews, applied }: {
  id: string; version: number; ready: boolean; doc: ResumeDocument; reviews: Review[];
  setReviews: (reviews: Review[]) => void; applied: (value: Loaded) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { void resumeReviews(id).then((items) => { if (items) setReviews(items); else setError("Could not load previous reviews."); setLoading(false); }); }, [id, setReviews]);
  const active = reviews.map((review) => matchingReview(review, doc)).filter((review) => review.suggestions.length);
  function decide(review: Review, ids: string[], accept: boolean) {
    start(async () => {
      const result = await decideReview(id, review.id, ids, accept);
      if (!result) { setError("Could not apply the review. Reload and try again."); return; }
      if (accept && result.version !== version) applied(result);
      const next = await resumeReviews(id);
      if (next) setReviews(next);
      setError("");
    });
  }
  return <section aria-labelledby="ai-review" className="grid gap-3 border-t border-border pt-4">
    <h2 id="ai-review" className="text-lg font-semibold">AI writing review</h2>
    <p className="text-sm text-muted-foreground">Sends: the Resume wording to Claude, made by Anthropic, using your daily AI budget. Private notes are not sent. Review each suggestion before applying it.</p>
    <Button type="button" variant="outline" disabled={!ready || pending || loading} onClick={() => start(async () => {
      const result = await reviewResume(id, version);
      if (result.review) { setReviews([result.review, ...reviews]); setError(""); }
      else setError(result.error ?? "Could not review this Resume.");
    })}>Review with AI</Button>
    {error && <p role="alert">{error}</p>}
    {active.map((review) => <div key={review.id} className="grid gap-3">
      <div className="flex gap-2"><Button type="button" variant="outline" disabled={!ready || pending} onClick={() => decide(review, review.suggestions.map((item) => item.id), true)}>Accept all</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => decide(review, review.suggestions.map((item) => item.id), false)}>Reject all</Button></div>
      {review.suggestions.map((item) => <div key={item.id} className="grid gap-2 rounded-lg border border-border p-3 text-sm">
        <p>Original: {plain(item.original)}</p><p>Suggestion: {plain(item.suggestion)}</p>
        <div className="flex gap-2"><Button type="button" size="sm" disabled={!ready || pending} onClick={() => decide(review, [item.id], true)}>Accept</Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => decide(review, [item.id], false)}>Reject</Button></div>
      </div>)}
    </div>)}
  </section>;
}
