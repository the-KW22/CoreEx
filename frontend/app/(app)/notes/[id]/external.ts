export type Change = "none" | "load" | "conflict";

// What an open editor does when the stored Note's version differs from its own: nothing when it is not newer (a late
// answer, or its own save), load it quietly when nothing is unsaved, and open the conflict when text is unsaved.
export function externalChange(storedVersion: number, mine: { version: number; unsaved: boolean }): Change {
  if (storedVersion <= mine.version) return "none";
  return mine.unsaved ? "conflict" : "load";
}

// The line shown after a change was loaded: who made it, when it was an Access token.
export const changedNotice = (editedBy: string | null) =>
  `${editedBy ? `Changed by ${editedBy}` : "Changed in another tab or device"} just now.`;
