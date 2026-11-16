import type { components } from "@/lib/api/schema";

export type Metadata = components["schemas"]["Metadata"];

// What the design controls start at, and what Reset brings back. The backend keeps every value in range (ResumeDocument
// .Metadata), so these are also its defaults.
export const DEFAULT_DESIGN: Omit<Metadata, "template" | "dateFormat" | "customCss"> = {
  accent: "#1d4ed8",
  font: "Inter",
  headingFont: "",
  fontSize: 10,
  density: "comfortable",
  pageSize: "A4",
  pageWidth: 595,
  pageHeight: 842,
  pageCount: 1,
  margin: 40,
  sidebarSide: "left",
  sidebarWidth: 170,
  entryColumns: 1,
  entryHeader: "inline",
  placements: [],
};

// The fonts the PDF can draw: Inter is embedded; the others are the PDF's own and need no files.
// shortcut: four families, upgrade to a font picker with more embedded families when someone needs one.
export const FONTS = [
  { value: "Inter", label: "Inter" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times", label: "Times (serif)" },
  { value: "Courier", label: "Courier (mono)" },
];

// How tight the page is: the line height, and a multiplier for the space between blocks.
export const DENSITIES = [
  { value: "compact", label: "Compact", line: 1.2, gap: 0.6 },
  { value: "comfortable", label: "Comfortable", line: 1.35, gap: 1 },
  { value: "relaxed", label: "Relaxed", line: 1.55, gap: 1.4 },
];

export const PAGE_SIZES = [
  { value: "A4", label: "A4" },
  { value: "LETTER", label: "Letter" },
  { value: "FREE", label: "Free-form" },
];

// The page's width and height in points.
export function pageDimensions(m: Metadata): [number, number] {
  if (m.pageSize === "LETTER") return [612, 792];
  if (m.pageSize === "FREE") return [m.pageWidth, m.pageHeight];
  return [595.28, 841.89];
}

// Back to the template's own look: every design setting, but not the template, the date format, the pages the Resume
// means to have or the custom rules (those have their own controls).
export const resetDesign = (m: Metadata): Metadata => ({
  ...DEFAULT_DESIGN,
  template: m.template,
  dateFormat: m.dateFormat,
  pageCount: m.pageCount,
  customCss: m.customCss,
});
