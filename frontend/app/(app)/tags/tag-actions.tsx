"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TAG_COLOURS, type TagColour, tagColour } from "@/lib/tag-colour";

import { deleteTag, renameTag, setTagColour } from "./actions";

type Tag = { id: string; name: string; colour?: TagColour | null; itemCount: number };

const icon = "pointer-coarse:size-11";
const AUTOMATIC = "automatic";

// Colour, Rename and Delete for one Tag, on the Tags page rows and on the Tag page header. `then` is where to go
// once the Tag is deleted, for the Tag page, which would otherwise be left showing a Tag that is gone.
export function TagActions({ tag, then }: { tag: Tag; then?: string }) {
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(tag.name);
  const [exists, setExists] = useState(false);

  const pick = (value: string) => {
    const colour = value === AUTOMATIC ? null : (value as TagColour);
    setPicking(false);
    startTransition(async () => {
      if (!(await setTagColour(tag.id, colour))) toast.error(`Could not change the colour of ${tag.name}. Try again.`);
    });
  };

  const rename = (event: React.FormEvent) => {
    event.preventDefault();
    setExists(false);
    startTransition(async () => {
      const result = await renameTag(tag.id, name);
      if (result === "exists") return setExists(true);
      if (result === "error") return void toast.error(`Could not rename ${tag.name}. Try again.`);
      setRenaming(false);
      toast.success(`Renamed to ${name.trim()}`);
    });
  };

  const remove = () =>
    startTransition(async () => {
      if (!(await deleteTag(tag.id, then))) toast.error(`Could not delete ${tag.name}. Try again.`);
      else toast.success(`Deleted ${tag.name}`);
    });

  return (
    <div className="flex items-center gap-0.5">
      <Popover open={picking} onOpenChange={setPicking}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Colour of ${tag.name}`} className={icon}>
            <span data-colour={tag.colour ?? tagColour(tag.name)} aria-hidden className="size-4 rounded-full bg-(--tag)" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-3">
          <RadioGroup
            aria-label={`Colour of ${tag.name}`}
            value={tag.colour ?? AUTOMATIC}
            onValueChange={pick}
            className="grid grid-cols-5 gap-2"
          >
            {[AUTOMATIC, ...TAG_COLOURS].map((value) => (
              <RadioGroupItem
                key={value}
                value={value}
                aria-label={value === AUTOMATIC ? "Automatic" : value}
                data-colour={value === AUTOMATIC ? undefined : value}
                className={
                  "size-7 rounded-full border-border shadow-none data-[state=checked]:ring-2 data-[state=checked]:ring-foreground data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-popover [&_svg]:hidden pointer-coarse:size-11 " +
                  (value === AUTOMATIC
                    ? "border-dashed bg-transparent dark:bg-transparent"
                    : "border-transparent bg-(--tag) dark:bg-(--tag)")
                }
              />
            ))}
          </RadioGroup>
          <p className="mt-2 text-xs text-muted-foreground">Dashed: pick a colour from the name.</p>
        </PopoverContent>
      </Popover>

      <Dialog
        open={renaming}
        onOpenChange={(open) => {
          setRenaming(open);
          if (open) {
            setName(tag.name);
            setExists(false);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Rename ${tag.name}`} className={icon}>
            <PencilIcon aria-hidden />
          </Button>
        </DialogTrigger>
        <DialogContent className="border-border bg-popover sm:max-w-sm">
          <form onSubmit={rename} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Rename Tag</DialogTitle>
              <DialogDescription>Every Item with {tag.name} gets the new name.</DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-sm font-medium">
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={50}
                autoComplete="off"
                aria-invalid={exists}
                aria-describedby={exists ? "rename-error" : undefined}
                className="h-9 rounded-lg border border-border bg-surface px-3 font-normal"
              />
              {exists && (
                <span id="rename-error" role="alert" className="text-xs font-normal text-destructive">
                  You already have a Tag with that name. Pick another name.
                </span>
              )}
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Delete ${tag.name}`} className={icon}>
            <Trash2Icon aria-hidden />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {tag.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the Tag from {tag.itemCount} {tag.itemCount === 1 ? "Item" : "Items"}. The Items are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Delete Tag
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
