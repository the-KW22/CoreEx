import type { Style } from "@react-pdf/types";

// The custom rules a Resume may carry (a small CSS): `heading { color: #ff0000; font-size: 14 }`. Rules aim at the
// named parts of the page, and only the properties and values below are accepted. The backend checks the very same
// lists (ResumeCss.java) and refuses anything else, so the renderer never sees a rule it cannot draw.
export const MAX_LENGTH = 5000;

export const PARTS = ["name", "headline", "contact", "heading", "text", "entry", "entry-title", "entry-subtitle", "entry-dates"] as const;
export type Part = (typeof PARTS)[number];

const HEX = /^#[0-9a-fA-F]{6}$/;
const points = (low: number, high: number) => (v: string) => {
  const m = /^(\d{1,2})(\.\d)?(pt)?$/.exec(v);
  if (!m) return false;
  const n = Number(m[1] + (m[2] ?? ""));
  return n >= low && n <= high;
};
const oneOf = (...allowed: string[]) => (v: string) => allowed.includes(v);

const PROPERTIES: Record<string, (value: string) => boolean> = {
  color: (v) => HEX.test(v),
  "background-color": (v) => HEX.test(v),
  "font-size": points(6, 30),
  "font-weight": oneOf("normal", "bold"),
  "font-style": oneOf("normal", "italic"),
  "text-align": oneOf("left", "center", "right", "justify"),
  "text-transform": oneOf("none", "uppercase", "lowercase", "capitalize"),
  "text-decoration": oneOf("none", "underline"),
  "margin-top": points(0, 60),
  "margin-bottom": points(0, 60),
  "padding-top": points(0, 60),
  "padding-bottom": points(0, 60),
};

// The property names, for the help text beside the rules.
export const PROPERTY_NAMES = Object.keys(PROPERTIES);

export type Rule ={ parts: Part[]; declarations: { property: string; value: string }[] };

// The rules in the text, and what is wrong with it (one sentence each; none when it is fine).
export function parseCss(css: string): { rules: Rule[]; problems: string[] } {
  const rules: Rule[] = [];
  const problems: string[] = [];
  if (css.trim() === "") return { rules, problems };
  if (css.length > MAX_LENGTH) return { rules, problems: [`The custom style is longer than ${MAX_LENGTH} characters.`] };
  const text = css.replace(/\/\*[\s\S]*?\*\//g, " ").trim();
  if (text === "") return { rules, problems };
  if (!text.endsWith("}")) return { rules, problems: ["A rule is not closed with }."] };
  for (const rule of text.slice(0, -1).split("}")) {
    const open = rule.indexOf("{");
    if (open < 0 || rule.indexOf("{", open + 1) >= 0) {
      problems.push("Each rule is a part name and then { ... }.");
      continue;
    }
    const parts: Part[] = [];
    for (const raw of rule.slice(0, open).split(",")) {
      const selector = raw.trim();
      if ((PARTS as readonly string[]).includes(selector)) parts.push(selector as Part);
      else problems.push(`"${selector}" is not a part of the page.`);
    }
    const declarations: Rule["declarations"] = [];
    for (const declaration of rule.slice(open + 1).split(";")) {
      if (declaration.trim() === "") continue;
      const colon = declaration.indexOf(":");
      const property = (colon < 0 ? declaration : declaration.slice(0, colon)).trim().toLowerCase();
      const value = colon < 0 ? "" : declaration.slice(colon + 1).trim();
      const check = PROPERTIES[property];
      if (!check) problems.push(`"${property}" is not a property you can set.`);
      else if (!check(value)) problems.push(`"${value}" is not a value for ${property}.`);
      else declarations.push({ property, value });
    }
    rules.push({ parts, declarations });
  }
  return { rules, problems };
}

const number = (v: string) => Number(v.replace("pt", ""));

// One declaration as a react-pdf style.
function style(property: string, value: string): Style {
  switch (property) {
    case "color":
      return { color: value };
    case "background-color":
      return { backgroundColor: value };
    case "font-size":
      return { fontSize: number(value) };
    case "text-align":
      return { textAlign: value as Style["textAlign"] };
    case "text-transform":
      return { textTransform: value as Style["textTransform"] };
    case "text-decoration":
      return { textDecoration: value as Style["textDecoration"] };
    case "margin-top":
      return { marginTop: number(value) };
    case "margin-bottom":
      return { marginBottom: number(value) };
    case "padding-top":
      return { paddingTop: number(value) };
    case "padding-bottom":
      return { paddingBottom: number(value) };
    // Bold and italic choose a face, not a style, so the template reads them as flags (see `facing`).
    default:
      return {};
  }
}

export type Custom = { styles: Partial<Record<Part, Style>>; bold: Partial<Record<Part, boolean>>; italic: Partial<Record<Part, boolean>> };

// The styles each part gets, later rules over earlier ones. Bold and italic are kept apart, because the PDF draws them
// with a different font face rather than a style.
export function customStyles(css: string): Custom {
  const out: Custom = { styles: {}, bold: {}, italic: {} };
  for (const rule of parseCss(css).rules) {
    for (const part of rule.parts) {
      for (const { property, value } of rule.declarations) {
        if (property === "font-weight") out.bold[part] = value === "bold";
        else if (property === "font-style") out.italic[part] = value === "italic";
        else out.styles[part] = { ...out.styles[part], ...style(property, value) };
      }
    }
  }
  return out;
}

// The part a place on the page belongs to, from its page map reference: what the element picker aims a rule at.
export function partOf(ref: string): Part | null {
  if (ref === "basics.name") return "name";
  if (ref === "basics.headline") return "headline";
  if (ref === "basics.email") return "contact";
  if (ref === "summary") return "text";
  if (ref.startsWith("section:")) return "heading";
  const [kind, , field] = ref.split(":");
  if (kind === "entry") return field === "title" ? "entry-title" : field === "subtitle" ? "entry-subtitle" : field === "dates" ? "entry-dates" : field === "description" ? "text" : "entry";
  if (kind === "role") return field === "title" ? "entry-title" : field === "dates" ? "entry-dates" : "text";
  return null;
}
