import type { components } from "../api/schema";
import { parseRich } from "./html";
import { resumeBlocks } from "./blocks";

type Doc = components["schemas"]["ResumeDocument"];
export type CheckIssue = { id: string; category: string; severity: "error" | "warning"; message: string; ref: string; ignored: boolean; fix?: "font" };

export function checkResume(doc: Doc, year: number): { score: number; issues: CheckIssue[] } {
  const issues: CheckIssue[] = [];
  const sidebar = new Set(resumeBlocks(doc).flatMap((block) => block.kind === "heading" && block.column === "side" ? [block.ref] : []));
  const add = (id: string, category: string, severity: CheckIssue["severity"], message: string, ref: string, fix?: CheckIssue["fix"]) =>
    issues.push({ id, category, severity, message, ref, fix, ignored: doc.ignoredChecks.includes(id) });
  if (!doc.basics.name.trim()) add("contact-name", "Contact", "error", "Add your name.", "basics.name");
  if (!doc.basics.email.trim()) add("contact-email", "Contact", "error", "Add an email address so employers can contact you.", "basics.email");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doc.basics.email.trim())) add("contact-email-invalid", "Contact", "error", "Check the email address.", "basics.email");
  if (!doc.basics.phone.trim()) add("contact-phone", "Contact", "warning", "Consider adding a phone number.", "basics.phone");
  if (!doc.basics.location.trim()) add("contact-location", "Contact", "warning", "Consider adding a location.", "basics.location");
  if (doc.basics.website.trim()) {
    try { if (!["http:", "https:"].includes(new URL(doc.basics.website).protocol)) throw new Error(); }
    catch { add("contact-url", "Contact", "warning", "Use a complete website URL beginning with https:// or http://.", "basics.website"); }
  }
  if (doc.basics.photo.assetId && doc.basics.photo.visible) add("contact-photo", "Contact", "warning", "A photo may not be appropriate for every application.", "basics.name");
  if (doc.metadata.fontSize < 9) add("layout-font-size", "Layout", "warning", "Text below 9 pt can be difficult to read.", "design", "font");
  if (doc.metadata.margin < 24) add("layout-margin", "Layout", "warning", "Narrow margins can make a Resume harder to read.", "design");
  if (doc.metadata.template === "sidebar") add("layout-columns", "Layout", "warning", "Some parsers may read two columns in an unexpected order.", "design");
  if (doc.metadata.entryColumns > 1) add("layout-entry-columns", "Layout", "warning", "Multiple columns may affect reading order.", "design");
  if (!doc.sections.some((s) => !s.hidden && s.kind === "EXPERIENCE" && s.entries.some((e) => !e.hidden))) add("heading-experience", "Headings", "warning", "Consider adding relevant experience.", "summary");
  if (!parseRich(doc.summary).some((b) => b.kind === "paragraph" ? b.runs.some((r) => r.text.trim()) : b.items.some((i) => i.some((r) => r.text.trim()))))
    add("writing-summary", "Writing", "warning", "Add a summary introducing your experience.", "summary");
  for (const section of doc.sections.filter((s) => !s.hidden)) {
    if (!section.title.trim()) add(`heading-${section.id}`, "Headings", "warning", "Give this section a heading.", `section:${section.id}`);
    const headings: Record<string, string[]> = { EXPERIENCE: ["experience", "work experience", "employment", "employment history", "professional experience"], EDUCATION: ["education", "academic background"], SKILLS: ["skills", "technical skills", "core skills"] };
    if (doc.locale.toLowerCase().startsWith("en") && section.title.trim() && headings[section.kind] && !headings[section.kind].includes(section.title.trim().toLowerCase()))
      add(`heading-nonstandard-${section.id}`, "Headings", "warning", "A standard section heading can be easier for parsers to recognize.", `section:${section.id}`);
    if (["EXPERIENCE", "EDUCATION", "PROJECTS", "VOLUNTEER"].includes(section.kind) && sidebar.has(`section:${section.id}`))
      add(`layout-sidebar-${section.id}`, "Layout", "warning", "Text-heavy sections in a sidebar may be read out of order.", `section:${section.id}`);
    for (const entry of section.entries.filter((e) => !e.hidden)) {
      if (section.kind === "EXPERIENCE" && !entry.description.replace(/<[^>]*>/g, "").trim() && !entry.roles.some((role) => role.description.replace(/<[^>]*>/g, "").trim()))
        add(`writing-${entry.id}`, "Writing", "warning", "Describe what you did in this role.", `entry:${entry.id}:description`);
      if (["EXPERIENCE", "EDUCATION"].includes(section.kind) && !entry.startDate.trim() && !entry.endDate.trim())
        add(`dates-missing-${entry.id}`, "Dates", "warning", "Consider adding dates for this entry.", `entry:${entry.id}:dates`);
      const validDate = (value: string) => /^(\d{4})(?:-(0[1-9]|1[0-2]))?(?:-(0[1-9]|[12]\d|3[01]))?$/.test(value);
      if ([entry.startDate, entry.endDate].some((date) => date.trim() && date.toLowerCase() !== "present" && !validDate(date)))
        add(`dates-invalid-${entry.id}`, "Dates", "warning", "Check that the dates can be read.", `entry:${entry.id}:dates`);
      if (validDate(entry.startDate) && Number(entry.startDate.slice(0, 4)) > year)
        add(`dates-future-${entry.id}`, "Dates", "warning", "This entry starts in the future; check its date.", `entry:${entry.id}:dates`);
      const earliest = (date: string) => date.length === 4 ? `${date}-01-01` : date.length === 7 ? `${date}-01` : date;
      const latest = (date: string) => date.length === 4 ? `${date}-12-31` : date.length === 7 ? `${date}-31` : date;
      if (validDate(entry.startDate) && validDate(entry.endDate) && earliest(entry.startDate) > latest(entry.endDate))
        add(`dates-${entry.id}`, "Dates", "error", "The end date is earlier than the start date.", `entry:${entry.id}:dates`);
    }
  }
  const penalty = issues.filter((i) => !i.ignored).reduce((sum, i) => sum + (i.severity === "error" ? 20 : 10), 0);
  return { score: Math.round(10000 / (100 + penalty)), issues };
}
