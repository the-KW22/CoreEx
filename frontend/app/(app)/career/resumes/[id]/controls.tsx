"use client";

import { useState, type Dispatch } from "react";

import { Button } from "@/components/ui/button";
import { accentContrast, MIN_CONTRAST } from "@/lib/resume/contrast";
import { MAX_LENGTH, PARTS, parseCss, PROPERTY_NAMES } from "@/lib/resume/custom-css";
import { DENSITIES, FONTS, type Metadata, PAGE_SIZES } from "@/lib/resume/design";
import { templateOf } from "@/lib/resume/blocks";

import type { Action, ResumeDocument } from "./store";

const input = "h-9 w-full rounded-lg border border-border bg-surface px-3";
const select = "h-9 w-full rounded-lg border border-border bg-surface px-2";

// A whole number that is only used once it is in range, so typing "1" on the way to "12" does not make the page tiny.
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isInteger(n) && n >= min && n <= max) onChange(n);
        }}
        className={input}
      />
    </label>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-medium">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={select}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const group = (title: string, children: React.ReactNode) => (
  <fieldset className="grid gap-3 rounded-lg border border-border p-3">
    <legend className="px-1 text-sm font-semibold">{title}</legend>
    <div className="grid gap-3 sm:grid-cols-2">{children}</div>
  </fieldset>
);

// Design mode below the templates: fonts, size, colour, page, margins, and the layout (sidebar, entry columns, entry
// header, and which column and page each section goes on). Every control is one field of the document's metadata.
export function Controls({
  doc,
  dispatch,
  onReset,
  css,
  onCss,
  picking,
  onPicking,
}: {
  doc: ResumeDocument;
  dispatch: Dispatch<Action>;
  onReset: () => void;
  css: string;
  onCss: (text: string) => void;
  picking: boolean;
  onPicking: () => void;
}) {
  const m = doc.metadata;
  const problems = parseCss(css).problems;
  const set = (patch: Partial<Metadata>) => dispatch({ type: "design", patch });
  const template = templateOf(doc);
  const contrast = accentContrast(m.accent, template);
  const placement = (section: string) => m.placements.find((p) => p.section === section);

  return (
    <section aria-labelledby="controls" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="controls" className="text-lg font-semibold">
          Design
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          Reset to template defaults
        </Button>
      </div>

      {group(
        "Typography",
        <>
          <Choice label="Text font" value={m.font} options={FONTS} onChange={(font) => set({ font })} />
          <Choice
            label="Heading font"
            value={m.headingFont}
            options={[{ value: "", label: "Same as text" }, ...FONTS]}
            onChange={(headingFont) => set({ headingFont })}
          />
          <NumberField label="Text size (pt)" value={m.fontSize} min={6} max={20} onChange={(fontSize) => set({ fontSize })} />
          <Choice label="Density" value={m.density} options={DENSITIES} onChange={(density) => set({ density })} />
        </>,
      )}

      {group(
        "Colour",
        <>
          <label className="grid gap-1 text-sm font-medium">
            Accent colour
            <input
              type="color"
              value={m.accent}
              onChange={(e) => set({ accent: e.target.value })}
              className="h-9 w-full cursor-pointer rounded-lg border border-border bg-surface p-1"
            />
          </label>
          <p role="status" className="self-end text-sm text-muted-foreground">
            {contrast.ok
              ? `Contrast ${contrast.ratio.toFixed(1)} to 1: easy to read.`
              : `Hard to read: contrast ${contrast.ratio.toFixed(1)} to 1, ${MIN_CONTRAST} to 1 is needed for ${contrast.onBand ? "white text on the header" : "headings on the page"}.`}
          </p>
        </>,
      )}

      {group(
        "Page",
        <>
          <Choice label="Page size" value={m.pageSize} options={PAGE_SIZES} onChange={(pageSize) => set({ pageSize })} />
          <NumberField label="Margin (pt)" value={m.margin} min={0} max={120} onChange={(margin) => set({ margin })} />
          {m.pageSize === "FREE" && (
            <>
              <NumberField label="Page width (pt)" value={m.pageWidth} min={200} max={2000} onChange={(pageWidth) => set({ pageWidth })} />
              <NumberField label="Page height (pt)" value={m.pageHeight} min={200} max={2000} onChange={(pageHeight) => set({ pageHeight })} />
            </>
          )}
        </>,
      )}

      {group(
        "Layout",
        <>
          <Choice
            label="Entries in columns"
            value={String(m.entryColumns)}
            options={[
              { value: "1", label: "One column" },
              { value: "2", label: "Two columns" },
            ]}
            onChange={(v) => set({ entryColumns: Number(v) })}
          />
          <Choice
            label="Entry header"
            value={m.entryHeader}
            options={[
              { value: "inline", label: "Dates beside the title" },
              { value: "stacked", label: "Dates under the title" },
            ]}
            onChange={(entryHeader) => set({ entryHeader })}
          />
          {template === "sidebar" && (
            <>
              <Choice
                label="Sidebar side"
                value={m.sidebarSide}
                options={[
                  { value: "left", label: "Left" },
                  { value: "right", label: "Right" },
                ]}
                onChange={(sidebarSide) => set({ sidebarSide })}
              />
              <NumberField label="Sidebar width (pt)" value={m.sidebarWidth} min={80} max={400} onChange={(sidebarWidth) => set({ sidebarWidth })} />
            </>
          )}
        </>,
      )}

      {doc.sections.length > 0 && (
        <fieldset className="grid gap-2 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Where sections go</legend>
          <ul className="grid gap-3" aria-label="Section placement">
            {doc.sections.map((section) => {
              const name = section.title.trim() || section.kind;
              const where = placement(section.id);
              return (
                <li key={section.id} className="grid items-end gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <span className="truncate text-sm font-medium">{name}</span>
                  {template === "sidebar" && (
                    <label className="grid gap-1 text-sm">
                      <span className="sr-only">Column of {name}</span>
                      <select
                        aria-label={`Column of ${name}`}
                        value={where?.column ?? ""}
                        onChange={(e) => dispatch({ type: "placeSection", section: section.id, column: e.target.value })}
                        className={select}
                      >
                        <option value="">Template default</option>
                        <option value="side">Sidebar</option>
                        <option value="main">Main column</option>
                      </select>
                    </label>
                  )}
                  <select
                    aria-label={`Page of ${name}`}
                    value={String(where?.page ?? 1)}
                    onChange={(e) => dispatch({ type: "placeSection", section: section.id, page: Number(e.target.value) })}
                    className={select}
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        Page {n}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      <fieldset className="grid gap-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold">Custom style</legend>
        <p className="text-sm text-muted-foreground">
          Rules like <code>heading {"{ color: #b91c1c; font-size: 13 }"}</code>. Parts: {PARTS.join(", ")}. Properties: {PROPERTY_NAMES.join(", ")}.
        </p>
        <label className="grid gap-1 text-sm font-medium">
          Custom style rules
          <textarea
            data-field="custom-css"
            value={css}
            rows={6}
            maxLength={MAX_LENGTH}
            spellCheck={false}
            onChange={(e) => onCss(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm"
          />
        </label>
        {problems.length > 0 && (
          <ul role="alert" aria-label="Problems with the custom style" className="list-disc pl-5 text-sm text-destructive">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
        {problems.length > 0 && (
          <p className="text-sm text-muted-foreground">The Resume keeps the last rules that were fine until these are fixed.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" aria-pressed={picking} onClick={onPicking}>
            {picking ? "Click a part on the page…" : "Pick a part on the page"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={css === ""} onClick={() => onCss("")}>
            Clear rules
          </Button>
        </div>
      </fieldset>
    </section>
  );
}
