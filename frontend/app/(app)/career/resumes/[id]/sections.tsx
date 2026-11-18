"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useRef, useState, type Dispatch, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DATE_FORMATS } from "@/lib/resume/dates";
import { cn } from "@/lib/utils";

import { EditorCard, useOpenState } from "./cards";
import { RichText, useLocked } from "./rich-text";
import { type Action, DEFAULT_TITLES, type Entry, type Kind, type ResumeDocument, type Role, type Section } from "./store";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";
const KINDS = Object.keys(DEFAULT_TITLES) as Kind[];
// Skills and languages say how well; the other kinds have no use for a level.
const WITH_LEVEL: Kind[] = ["SKILLS", "LANGUAGES"];

type Drag = { type: "section" | "entry"; id: string; section?: string } | null;

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" variant="outline" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

// A date as the editor stores it (YYYY-MM), with "Present" for an end that is still going.
function DateField({
  label,
  value,
  onChange,
  canBePresent,
  field,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  canBePresent?: boolean;
  field?: string;
}) {
  const present = value === "present";
  return (
    <div className="grid gap-1 text-sm font-medium">
      <label className="grid gap-1">
        {label}
        <input
          type="month"
          data-field={field}
          value={present ? "" : value}
          disabled={present}
          onChange={(e) => onChange(e.target.value)}
          className={input}
        />
      </label>
      {canBePresent && (
        <label className="flex items-center gap-2 font-normal">
          <input type="checkbox" className="size-6" checked={present} onChange={(e) => onChange(e.target.checked ? "present" : "")} />
          Present
        </label>
      )}
    </div>
  );
}

function RoleForm({ section, entry, role, dispatch }: { section: string; entry: string; role: Role; dispatch: Dispatch<Action> }) {
  const edit = (patch: Partial<Role>) => dispatch({ type: "editRole", section, entry, id: role.id, patch });
  return (
    <li className="grid gap-3 rounded-lg border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-medium sm:col-span-3">
          Role title
          <input data-field={`role:${role.id}:title`} value={role.title} maxLength={200} onChange={(e) => edit({ title: e.target.value })} className={input} />
        </label>
        <DateField label="Role start" field={`role:${role.id}:dates`} value={role.startDate} onChange={(v) => edit({ startDate: v })} />
        <DateField label="Role end" value={role.endDate} onChange={(v) => edit({ endDate: v })} canBePresent />
      </div>
      <div className="grid gap-1 text-sm font-medium">
        Role description
        <RichText label="Role description" field={`role:${role.id}:description`} html={role.description} onChange={(html) => edit({ description: html })} />
      </div>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "removeRole", section, entry, id: role.id })}>
          <Trash2Icon aria-hidden />
          Remove role
        </Button>
      </div>
    </li>
  );
}

// An entry is one line (its title, then its subtitle and dates) until it is opened. Its buttons stay on that line.
function EntryForm({
  section,
  sections,
  entry,
  index,
  count,
  dispatch,
  dragRef,
}: {
  section: Section;
  sections: Section[];
  entry: Entry;
  index: number;
  count: number;
  dispatch: Dispatch<Action>;
  dragRef: RefObject<Drag>;
}) {
  const edit = (patch: Partial<Entry>) => dispatch({ type: "editEntry", section: section.id, id: entry.id, patch });
  const label = entry.title.trim() || "Untitled entry";
  const others = sections.filter((s) => s.kind === section.kind && s.id !== section.id);
  const [keywords, setKeywords] = useState(entry.keywords.join(", "));
  const { isOpen, setOpen } = useOpenState();
  const key = `entry:${entry.id}`;
  // A locked Resume disables the form, open buttons included, so its entries start open to stay readable.
  const open = isOpen(key, useLocked());
  const dates = [entry.startDate, entry.endDate].filter(Boolean).map((d) => (d === "present" ? "Present" : d)).join(" – ");
  const summary = [entry.subtitle, dates].filter(Boolean).join(" · ");
  return (
    <li
      className="grid gap-3 rounded-lg border border-border bg-surface p-3"
      onDragOver={(e) => {
        if (dragRef.current?.type === "entry" && dragRef.current.section === section.id) e.preventDefault();
      }}
      onDrop={(e) => {
        if (dragRef.current?.type !== "entry" || dragRef.current.section !== section.id) return;
        e.preventDefault();
        dispatch({ type: "moveEntry", section: section.id, id: dragRef.current.id, to: index });
        dragRef.current = null;
      }}
    >
      <Collapsible open={open} onOpenChange={(next) => setOpen(key, next)} className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            draggable
            aria-hidden
            onDragStart={() => (dragRef.current = { type: "entry", id: entry.id, section: section.id })}
            className="cursor-grab text-muted-foreground"
          >
            <GripVerticalIcon className="size-4" />
          </span>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left">
              <ChevronDownIcon aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate font-medium ${entry.hidden ? "text-muted-foreground line-through" : ""}`}>{label}</span>
                {summary && <span className="block truncate text-sm text-muted-foreground">{summary}</span>}
              </span>
            </button>
          </CollapsibleTrigger>
          <IconButton label={`Move ${label} up`} disabled={index === 0} onClick={() => dispatch({ type: "moveEntry", section: section.id, id: entry.id, to: index - 1 })}>
            <ArrowUpIcon aria-hidden />
          </IconButton>
          <IconButton label={`Move ${label} down`} disabled={index === count - 1} onClick={() => dispatch({ type: "moveEntry", section: section.id, id: entry.id, to: index + 1 })}>
            <ArrowDownIcon aria-hidden />
          </IconButton>
          <IconButton
            label={`Duplicate ${label}`}
            onClick={() => {
              const newId = crypto.randomUUID();
              setOpen(`entry:${newId}`, true);
              dispatch({ type: "duplicateEntry", section: section.id, id: entry.id, newId });
            }}
          >
            <CopyIcon aria-hidden />
          </IconButton>
          <IconButton label={`${entry.hidden ? "Show" : "Hide"} ${label}`} onClick={() => dispatch({ type: "toggleEntry", section: section.id, id: entry.id })}>
            {entry.hidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
          </IconButton>
          <IconButton label={`Delete ${label}`} onClick={() => dispatch({ type: "removeEntry", section: section.id, id: entry.id })}>
            <Trash2Icon aria-hidden />
          </IconButton>
        </div>

        <CollapsibleContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium">
              Title
              <input data-field={`entry:${entry.id}:title`} value={entry.title} maxLength={200} onChange={(e) => edit({ title: e.target.value })} className={input} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Subtitle
              <input data-field={`entry:${entry.id}:subtitle`} value={entry.subtitle} maxLength={200} onChange={(e) => edit({ subtitle: e.target.value })} className={input} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Location
              <input value={entry.location} maxLength={200} onChange={(e) => edit({ location: e.target.value })} className={input} />
            </label>
            <label className="grid gap-1 text-sm font-medium">
              Link
              <input type="url" data-field={`entry:${entry.id}:url`} value={entry.url} maxLength={500} onChange={(e) => edit({ url: e.target.value })} className={input} />
            </label>
            <DateField label="Start" field={`entry:${entry.id}:dates`} value={entry.startDate} onChange={(v) => edit({ startDate: v })} />
            <DateField label="End" value={entry.endDate} onChange={(v) => edit({ endDate: v })} canBePresent />
            {WITH_LEVEL.includes(section.kind) && (
              <label className="grid gap-1 text-sm font-medium">
                Level
                <input value={entry.level} maxLength={100} onChange={(e) => edit({ level: e.target.value })} className={input} />
              </label>
            )}
            <label className="grid gap-1 text-sm font-medium">
              Keywords, separated by commas
              <input
                data-field={`entry:${entry.id}:keywords`}
                value={keywords}
                onChange={(e) => {
                  setKeywords(e.target.value);
                  edit({ keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) });
                }}
                className={input}
              />
            </label>
          </div>

          <div className="grid gap-1 text-sm font-medium">
            Description
            <RichText label={`${label} description`} field={`entry:${entry.id}:description`} html={entry.description} onChange={(html) => edit({ description: html })} />
          </div>

          {section.kind === "EXPERIENCE" && (
            <div className="grid gap-2">
              {entry.roles.length > 0 && (
                <ul className="grid gap-2" aria-label={`Roles at ${label}`}>
                  {entry.roles.map((role) => (
                    <RoleForm key={role.id} section={section.id} entry={entry.id} role={role} dispatch={dispatch} />
                  ))}
                </ul>
              )}
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "addRole", section: section.id, entry: entry.id, id: crypto.randomUUID() })}>
                  <PlusIcon aria-hidden />
                  Add a role
                </Button>
              </div>
            </div>
          )}

          {others.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              Move to
              <select
                value=""
                onChange={(e) => e.target.value && dispatch({ type: "moveEntryTo", section: section.id, id: entry.id, target: e.target.value })}
                className="h-9 rounded-lg border border-border bg-surface px-2"
              >
                <option value="">Another {DEFAULT_TITLES[section.kind].toLowerCase()} section…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title || DEFAULT_TITLES[o.kind]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

// Write mode below the summary: the Resume's sections and their entries, and the one date format they print in.
export function Sections({ doc, dispatch }: { doc: ResumeDocument; dispatch: Dispatch<Action> }) {
  const [kind, setKind] = useState<Kind>("EXPERIENCE");
  const dragRef = useRef<Drag>(null);
  const { sections } = doc;
  const { setOpen } = useOpenState();

  return (
    <div className="grid gap-6">
      <section aria-labelledby="sections" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="sections" className="text-lg font-semibold">
            Sections
          </h2>
          <label className="grid gap-1 text-sm font-medium">
            Date format
            <select
              value={doc.metadata.dateFormat}
              onChange={(e) => dispatch({ type: "dateFormat", value: e.target.value })}
              className="h-9 rounded-lg border border-border bg-surface px-2 font-normal"
            >
              {DATE_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm font-medium">
            Kind of section
            <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="h-9 rounded-lg border border-border bg-surface px-2 font-normal">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {DEFAULT_TITLES[k]}
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" onClick={() => dispatch({ type: "addSection", id: crypto.randomUUID(), kind })}>
            <PlusIcon aria-hidden />
            Add section
          </Button>
        </div>
      </section>

      {sections.map((section, index) => {
        const name = section.title.trim() || DEFAULT_TITLES[section.kind];
        return (
          <EditorCard
            key={section.id}
            cardKey={`card:section:${section.id}`}
            label={name}
            onDragOver={(e) => {
              if (dragRef.current?.type === "section") e.preventDefault();
            }}
            onDrop={(e) => {
              if (dragRef.current?.type !== "section") return;
              e.preventDefault();
              dispatch({ type: "moveSection", id: dragRef.current.id, to: index });
              dragRef.current = null;
            }}
            title={
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span
                  draggable
                  aria-hidden
                  onDragStart={() => (dragRef.current = { type: "section", id: section.id })}
                  className="cursor-grab text-muted-foreground"
                >
                  <GripVerticalIcon className="size-4" />
                </span>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Section name</span>
                  <input
                    data-field={`section:${section.id}`}
                    value={section.title}
                    maxLength={200}
                    onChange={(e) => dispatch({ type: "renameSection", id: section.id, title: e.target.value })}
                    className="h-9 w-full rounded-lg border border-transparent bg-transparent px-2 text-base font-semibold hover:border-border focus:border-link"
                  />
                </label>
                <span className="shrink-0 text-sm text-muted-foreground">· {section.entries.length}</span>
              </div>
            }
            actions={
              <>
                <IconButton label={`Move ${name} up`} disabled={index === 0} onClick={() => dispatch({ type: "moveSection", id: section.id, to: index - 1 })}>
                  <ArrowUpIcon aria-hidden />
                </IconButton>
                <IconButton label={`Move ${name} down`} disabled={index === sections.length - 1} onClick={() => dispatch({ type: "moveSection", id: section.id, to: index + 1 })}>
                  <ArrowDownIcon aria-hidden />
                </IconButton>
                <IconButton label={`${section.hidden ? "Show" : "Hide"} ${name}`} onClick={() => dispatch({ type: "toggleSection", id: section.id })}>
                  {section.hidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />}
                </IconButton>
                <IconButton label={`Remove ${name}`} onClick={() => dispatch({ type: "removeSection", id: section.id })}>
                  <Trash2Icon aria-hidden />
                </IconButton>
              </>
            }
          >
            {section.entries.length > 0 && (
              <ul className="grid gap-2" aria-label={`Entries of ${name}`}>
                {section.entries.map((entry, i) => (
                  <EntryForm key={entry.id} section={section} sections={sections} entry={entry} index={i} count={section.entries.length} dispatch={dispatch} dragRef={dragRef} />
                ))}
              </ul>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const id = crypto.randomUUID();
                  setOpen(`entry:${id}`, true);
                  dispatch({ type: "addEntry", section: section.id, id });
                }}
              >
                <PlusIcon aria-hidden />
                Add an entry
              </Button>
            </div>
          </EditorCard>
        );
      })}
    </div>
  );
}
