"use client";

import { ChevronDownIcon } from "lucide-react";
import { createContext, useContext, type HTMLAttributes, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

// Which editor cards and entries are open. Keys: "card:contact", "card:summary", "card:photo", "card:notes",
// "card:section:<id>" for a section and "entry:<id>" for an entry. Only what changed is stored; the rest keep the default
// their card gives them.
export type OpenState = {
  isOpen: (key: string, fallback: boolean) => boolean;
  setOpen: (key: string, open: boolean) => void;
  reveal: (keys: string[]) => void;
};

export const OpenContext = createContext<OpenState | null>(null);

export function useOpenState(): OpenState {
  const value = useContext(OpenContext);
  if (!value) throw new Error("useOpenState needs an OpenContext");
  return value;
}

// The element id of a card, from its key ("card:section:x" becomes "card-section-x"). Jump links scroll to it.
export const cardDomId = (key: string) => key.replace(/:/g, "-");

// An editor block as a card: a header row (a chevron to open and close it, its title and its buttons) and the body
// underneath, which is not in the page while the card is closed.
// shortcut: no open/closed memory across reloads, cards open by their default each visit, upgrade if users ask for it.
export function EditorCard({
  cardKey,
  label,
  title,
  actions,
  defaultOpen = true,
  children,
  ...rest
}: {
  cardKey: string;
  label: string;
  title: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "title">) {
  const { isOpen, setOpen } = useOpenState();
  const open = isOpen(cardKey, defaultOpen);
  return (
    <section aria-label={label} id={cardDomId(cardKey)} className="scroll-mt-4 rounded-lg border border-border p-3" {...rest}>
      <Collapsible open={open} onOpenChange={(next) => setOpen(cardKey, next)} className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label={`${open ? "Collapse" : "Expand"} ${label}`}>
              <ChevronDownIcon aria-hidden className={cn("transition-transform", !open && "-rotate-90")} />
            </Button>
          </CollapsibleTrigger>
          {title}
          {actions}
        </div>
        <CollapsibleContent className="grid gap-3">{children}</CollapsibleContent>
      </Collapsible>
    </section>
  );
}
