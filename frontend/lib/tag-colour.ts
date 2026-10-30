// The 8 Tag colours (docs/DESIGN.md 4.4). The API stores one of these names; the shades live in globals.css.
export const TAG_COLOURS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "pink"] as const;
export type TagColour = (typeof TAG_COLOURS)[number];

// A colour for a Tag with none picked: a stable hash of the name, lower-cased because Tag names ignore case.
export function tagColour(name: string): TagColour {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return TAG_COLOURS[hash % TAG_COLOURS.length];
}
