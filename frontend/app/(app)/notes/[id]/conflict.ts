import { withHeading } from "./text";

const SUFFIX = " (mine)";
const TITLE_MAX = 200;

// The Note that keeps the User's text when they load the other version: "<title> (mine)", cut so the whole name
// fits a title, and with the same name as its heading so title and first line agree.
export function copyOf(text: { title: string; body: string }) {
  let name = (text.title.trim() || "Untitled").slice(0, TITLE_MAX - SUFFIX.length);
  // Do not leave half of a character outside the basic plane.
  if (/[\uD800-\uDBFF]$/.test(name)) name = name.slice(0, -1);
  const title = `${name.trimEnd()}${SUFFIX}`;
  return { title, body: withHeading(text.body, title) };
}
