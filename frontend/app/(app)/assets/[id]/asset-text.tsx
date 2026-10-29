"use client";

import { useRef } from "react";
import { toast } from "sonner";

import { saveAssetText } from "../actions";

const field =
  "w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-foreground hover:border-border focus-visible:border-border focus-visible:bg-surface";

// An Asset's title and description, edited where they are shown. Leaving a field (or Enter in the title) saves;
// a failed save puts the last saved text back.
export function AssetText({ id, title, description }: { id: string; title: string; description: string }) {
  const saved = useRef({ title, description });
  const titleField = useRef<HTMLInputElement>(null);
  const descriptionField = useRef<HTMLTextAreaElement>(null);

  async function save() {
    const next = { title: titleField.current!.value.trim(), description: descriptionField.current!.value };
    if (next.title === saved.current.title && next.description === saved.current.description) return;
    if (!next.title) {
      titleField.current!.value = saved.current.title;
      toast.error("An Asset needs a title.");
      return;
    }
    if (await saveAssetText(id, next.title, next.description)) {
      saved.current = next;
      toast.success("Saved");
    } else {
      titleField.current!.value = saved.current.title;
      descriptionField.current!.value = saved.current.description;
      toast.error("Could not save the changes. Try again.");
    }
  }

  return (
    <div className="-mx-2 grid gap-1">
      <label className="grid gap-0.5 px-2 text-xs text-muted-foreground">
        Title
        <input
          ref={titleField}
          defaultValue={title}
          required
          maxLength={200}
          onBlur={() => void save()}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className={`${field} -mx-2 text-base font-semibold`}
        />
      </label>
      <label className="grid gap-0.5 px-2 text-xs text-muted-foreground">
        Description
        <textarea
          ref={descriptionField}
          defaultValue={description}
          maxLength={2000}
          rows={3}
          placeholder="Add a description"
          onBlur={() => void save()}
          className={`${field} -mx-2 resize-y text-sm placeholder:text-muted-foreground`}
        />
      </label>
    </div>
  );
}
