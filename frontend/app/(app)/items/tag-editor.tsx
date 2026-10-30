"use client";

import { PlusIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { TagBadge } from "@/components/tag-badge";
import type { TagColour } from "@/lib/tag-colour";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { tagItem, untagItem } from "./actions";

type Tag = { id: string; name: string; colour?: TagColour | null };

// An Item's Tags as pills, each removable, and "+ Tag": pick one of your Tags or type a new name.
export function TagEditor({ itemId, tags, allTags }: { itemId: string; tags: Tag[]; allTags: Tag[] }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const onItem = new Set(tags.map((t) => t.name.toLowerCase()));
  const choices = allTags.filter((t) => !onItem.has(t.name.toLowerCase()));
  const typed = text.trim();
  // Tag names ignore case, so "work" is the existing "Work".
  const isNew = typed && !allTags.some((t) => t.name.toLowerCase() === typed.toLowerCase());

  const add = (name: string) => {
    setOpen(false);
    setText("");
    startTransition(async () => {
      if (!(await tagItem(itemId, name))) toast.error("Could not add the Tag. Try again.");
    });
  };
  const remove = (tag: Tag) =>
    startTransition(async () => {
      if (!(await untagItem(itemId, tag.id))) toast.error(`Could not remove the Tag ${tag.name}. Try again.`);
    });

  return (
    <ul aria-label="Tags" className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <li key={tag.id} className="flex items-center">
          <Link href={`/tags/${tag.id}`} className="rounded-full">
            <TagBadge name={tag.name} colour={tag.colour} />
          </Link>
          <button
            type="button"
            onClick={() => remove(tag)}
            disabled={pending}
            aria-label={`Remove the Tag ${tag.name}`}
            className="grid size-6 place-items-center rounded-full text-muted-foreground hover:text-foreground pointer-coarse:size-11"
          >
            <XIcon aria-hidden className="size-3.5" />
          </button>
        </li>
      ))}
      <li>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            disabled={pending}
            className="flex h-6 items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground pointer-coarse:h-11"
          >
            <PlusIcon aria-hidden className="size-3.5" />
            Tag
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-0">
            <Command>
              <CommandInput value={text} onValueChange={setText} placeholder="Find or create a Tag" maxLength={50} />
              <CommandList>
                <CommandEmpty>
                  {!typed ? "No other Tags yet." : onItem.has(typed.toLowerCase()) ? "It already has that Tag." : "No Tag has that name."}
                </CommandEmpty>
                {isNew && (
                  <CommandGroup>
                    <CommandItem value={`create:${typed}`} onSelect={() => add(typed)}>
                      <PlusIcon aria-hidden />
                      Create &ldquo;{typed}&rdquo;
                    </CommandItem>
                  </CommandGroup>
                )}
                {choices.length > 0 && (
                  <CommandGroup heading="Your Tags">
                    {choices.map((tag) => (
                      <CommandItem key={tag.id} value={tag.name} onSelect={() => add(tag.name)}>
                        <TagBadge name={tag.name} colour={tag.colour} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </li>
    </ul>
  );
}
