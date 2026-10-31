"use client";

import type { StateCommand } from "@codemirror/state";
import {
  BoldIcon,
  BracketsIcon,
  CodeIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  SquareCodeIcon,
  StrikethroughIcon,
  TableIcon,
} from "lucide-react";
import { Toolbar as ToolbarPrimitive } from "radix-ui";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  insertDivider,
  insertLink,
  insertTable,
  insertWikilink,
  setHeading,
  toggleCodeBlock,
  toggleInline,
  toggleLinePrefix,
} from "./format";

const button =
  "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface hover:text-foreground aria-pressed:bg-border aria-pressed:text-foreground pointer-coarse:size-11 [&_svg]:size-4";

type Tool = { id: string; label: string; shortcut?: string; icon: typeof BoldIcon; command: StateCommand };

// Groups of buttons, a divider between groups.
export const TOOLS: Tool[][] = [
  [
    { id: "bold", label: "Bold", shortcut: "Ctrl+B", icon: BoldIcon, command: toggleInline("bold") },
    { id: "italic", label: "Italic", shortcut: "Ctrl+I", icon: ItalicIcon, command: toggleInline("italic") },
    { id: "strike", label: "Strikethrough", icon: StrikethroughIcon, command: toggleInline("strike") },
    { id: "code", label: "Inline code", icon: CodeIcon, command: toggleInline("code") },
  ],
  [
    { id: "bullet", label: "Bulleted list", icon: ListIcon, command: toggleLinePrefix("bullet") },
    { id: "numbered", label: "Numbered list", icon: ListOrderedIcon, command: toggleLinePrefix("numbered") },
    { id: "task", label: "Checklist", icon: ListChecksIcon, command: toggleLinePrefix("task") },
    { id: "quote", label: "Quote", icon: QuoteIcon, command: toggleLinePrefix("quote") },
    { id: "codeBlock", label: "Code block", icon: SquareCodeIcon, command: toggleCodeBlock },
  ],
  [
    { id: "link", label: "Link", shortcut: "Ctrl+K", icon: LinkIcon, command: insertLink },
    { id: "wikilink", label: "Link to a Note or Asset", icon: BracketsIcon, command: insertWikilink },
    { id: "table", label: "Table", icon: TableIcon, command: insertTable },
    { id: "divider", label: "Divider", icon: MinusIcon, command: insertDivider },
  ],
];

const HEADINGS: { level: 0 | 1 | 2 | 3; label: string }[] = [
  { level: 0, label: "Normal text" },
  { level: 1, label: "Heading 1" },
  { level: 2, label: "Heading 2" },
  { level: 3, label: "Heading 3" },
];

// The formatting bar above the editor (docs/DESIGN.md section 6.3). `run` applies a command to the editor and keeps its
// focus; `active` is what the caret is inside, as a space-separated list. Arrow keys move between the buttons.
export function EditorToolbar({
  run,
  active,
}: {
  run: (command: StateCommand, id?: string) => void;
  active: string;
}) {
  const on = new Set(active.split(" "));
  const headingOn = ["heading1", "heading2", "heading3"].some((h) => on.has(h));
  return (
    <ToolbarPrimitive.Root
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-0.5 rounded-[10px] border border-border bg-surface p-1"
    >
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <ToolbarPrimitive.Button aria-label="Heading" aria-pressed={headingOn} className={button}>
                <HeadingIcon aria-hidden />
              </ToolbarPrimitive.Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Heading</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
          {HEADINGS.map(({ level, label }) => (
            <DropdownMenuItem key={level} onSelect={() => run(setHeading(level))}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {TOOLS.map((group, i) => (
        <div key={i} className="flex items-center gap-0.5">
          <ToolbarPrimitive.Separator className="mx-1 h-5 w-px bg-border" />
          {group.map(({ id, label, shortcut, icon: Icon, command }) => {
            // Link, table and divider add something; the rest switch on and off.
            const toggles = !["wikilink", "table", "divider"].includes(id);
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <ToolbarPrimitive.Button
                    type="button"
                    aria-label={label}
                    aria-pressed={toggles ? on.has(id) : undefined}
                    aria-keyshortcuts={shortcut?.replace("Ctrl", "Control")}
                    onClick={() => run(command, id)}
                    className={button}
                  >
                    <Icon aria-hidden />
                  </ToolbarPrimitive.Button>
                </TooltipTrigger>
                <TooltipContent>{shortcut ? `${label} (${shortcut})` : label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </ToolbarPrimitive.Root>
  );
}
