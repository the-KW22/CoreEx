"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Alert } from "@/components/alert";
import { Button } from "@/components/ui/button";

import { clearStory, createStory } from "./actions";

// Story Notes (decision C5): a normal Note with the Story flag. "New Story" starts one with the five headings.
// shortcut: a Note that is not a Story yet is flagged from its own screen only after the Note editor gets the control, so this list only starts and clears Stories, upgrade when the Note editor gets the Story toggle.
export function Stories({ stories }: { stories: { id: string; title: string }[] }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <section aria-labelledby="stories-heading" className="grid gap-4">
      <h2 id="stories-heading" className="text-lg font-semibold">Stories</h2>
      <p className="text-sm text-muted-foreground">Examples for interviews, each kept as a Note with Situation, Task, Action, Result and Reflection.</p>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await createStory(title);
          if (result.ok) { setTitle(""); setError(""); } else setError(result.message);
        });
      }}>
        <label className="grid gap-1 text-sm font-medium">Story name
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-3" />
        </label>
        <Button type="submit" variant="outline" disabled={pending}>New Story</Button>
      </form>
      {error && <Alert>{error}</Alert>}
      {stories.length === 0 && <p className="text-sm text-muted-foreground">No Stories yet.</p>}
      <ul className="grid gap-2">
        {stories.map((story) => (
          <li key={story.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
            <Link href={`/items/${story.id}`} className="font-medium underline-offset-4 hover:underline">{story.title}</Link>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => {
              const result = await clearStory(story.id);
              if (!result.ok) setError(result.message);
            })}>Remove Story kind</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
