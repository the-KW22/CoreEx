import type { Completion, CompletionSource } from "@codemirror/autocomplete";
import { StateEffect, StateField } from "@codemirror/state";

import type { components } from "@/lib/api/schema";

export type LinkTarget = components["schemas"]["LinkTargetResponse"];

// What the editor knows about Link targets, by id: the target's current details, or null when the id is not a live
// Item of this User (missing, in the Trash, or someone else's). An id that is absent has not been looked up yet.
export const setLinks = StateEffect.define<Record<string, LinkTarget | null>>();

export const linkField = StateField.define<Record<string, LinkTarget | null>>({
  create: () => ({}),
  update(known, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setLinks)) known = { ...known, ...effect.value };
    }
    return known;
  },
});

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const STORED = new RegExp(`^(${UUID})(?:\\|(.*))?$`);

// The stored Link text must not contain brackets (they would end the Link early).
export const plainTitle = (title: string) => title.replace(/\[/g, "(").replace(/]/g, ")");

// A "[[...]]" token: no brackets or line breaks inside. Same shape the backend parser looks for.
export const LINK_TOKEN = /\[\[([^[\]\n]+)]]/g;

// The inside of a token: a stored Link (id and the text written when linking), or a hand-typed title.
export function readLink(inner: string): { id: string; text: string } | { title: string } | null {
  const stored = STORED.exec(inner);
  if (stored) return { id: stored[1].toLowerCase(), text: (stored[2] ?? "").trim() };
  const title = inner.trim();
  return title ? { title } : null;
}

// Ids of the stored Links in a text. Links inside code are included; looking them up is harmless.
export function linkIds(text: string): string[] {
  const ids = new Set<string>();
  for (const match of text.matchAll(LINK_TOKEN)) {
    const link = readLink(match[1]);
    if (link && "id" in link) ids.add(link.id);
  }
  return [...ids];
}

const kind = (target: LinkTarget) => (target.type === "NOTE" ? "Note" : "Asset");

// Typing "[[" lists the User's Items by title, with their type and Folder path; choosing one writes the stored form.
export function linkCompletion(suggest: (text: string) => Promise<LinkTarget[]>): CompletionSource {
  return async (context) => {
    const typed = context.matchBefore(/\[\[[^[\]|\n]*/);
    if (!typed) return null;
    const found = await suggest(typed.text.slice(2));
    return {
      from: typed.from + 2,
      filter: false, // the server already filtered
      options: found.map(
        (target): Completion => ({
          label: target.title,
          detail: target.folderPath ? `${kind(target)} · ${target.folderPath}` : kind(target),
          apply: (view, _completion, from, to) => {
            // Replace "[[typed" and any "]]" the editor already closed it with.
            const close = view.state.doc.sliceString(to, to + 2) === "]]" ? 2 : 0;
            const link = `[[${target.id}|${plainTitle(target.title)}]]`;
            view.dispatch({
              changes: { from: from - 2, to: to + close, insert: link },
              selection: { anchor: from - 2 + link.length },
              effects: setLinks.of({ [target.id]: target }),
            });
          },
        }),
      ),
    };
  };
}
