"use client";

import { PencilIcon } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { saveAssetText } from "../actions";

// A faint border at rest says "this is a field", and the pencil beside the label says it can be changed.
const field =
  "w-full rounded-lg border border-border-subtle bg-transparent px-2.5 py-1.5 text-foreground hover:border-border focus-visible:border-link focus-visible:bg-surface";
const label = "flex items-center gap-1.5 text-xs text-muted-foreground";

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
    <div className="grid gap-4">
      <label className="grid gap-1.5">
        <span className={label}>
          Title
          <PencilIcon aria-hidden className="size-3" />
        </span>
        <input
          ref={titleField}
          defaultValue={title}
          required
          maxLength={200}
          onBlur={() => void save()}
          onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
          className={`${field} text-base font-semibold`}
        />
      </label>
      <label className="grid gap-1.5">
        <span className={label}>
          Description
          <PencilIcon aria-hidden className="size-3" />
        </span>
        <textarea
          ref={descriptionField}
          defaultValue={description}
          maxLength={2000}
          rows={3}
          placeholder="Add a description"
          onBlur={() => void save()}
          className={`${field} resize-y text-sm placeholder:text-muted-foreground`}
        />
      </label>
    </div>
  );
}
