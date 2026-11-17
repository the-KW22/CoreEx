"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/alert";

import { setStory } from "./actions";

// Marks this Note as a Story (or clears it); Stories are listed on the Knowledge page (decision C5).
export function StoryToggle({ noteId, isStory }: { noteId: string; isStory: boolean }) {
  const [on, setOn] = useState(isStory);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <section aria-labelledby="story-heading" className="grid gap-2">
      <h2 id="story-heading" className="text-xs font-semibold text-muted-foreground">Story</h2>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} disabled={pending} onChange={(e) => {
          const next = e.target.checked;
          start(async () => {
            const result = await setStory(noteId, next);
            if (result.ok) { setOn(next); setError(""); } else setError(result.message);
          });
        }} />
        This Note is a Story
      </label>
      {error && <Alert>{error}</Alert>}
    </section>
  );
}
