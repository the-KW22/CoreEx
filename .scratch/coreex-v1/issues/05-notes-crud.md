Status: ready-for-agent
Blocked by: 02

# 05 — Notes: create, edit with live preview, autosave, delete

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

A User creates a Note, gives it a title, and writes Markdown in a CodeMirror 6 live-preview editor (headings, emphasis, lists, checkboxes, and code render as you type). The Note autosaves with a debounce. Each save carries the last-seen version, and a stale save gets `VERSION_CONFLICT`, which the UI handles by offering to reload or overwrite. Items are listed by last updated. Deleting a Note soft-deletes it (sets `deleted_at` and a trash batch) and hides it everywhere; the Trash UI arrives in 11. This ticket introduces the shared **items** table that Notes and Assets both use.

## Acceptance criteria

- [ ] A User can create, open, rename, edit, and delete their Notes; untitled Notes are allowed
- [ ] Content is stored as Markdown exactly as written (ADR 0002)
- [ ] Autosave shows a saved/saving indicator; a stale version gets 409 VERSION_CONFLICT and the UI offers reload or overwrite
- [ ] Deleted Notes disappear from the Item list
- [ ] User B gets 404 for every operation on User A's Note (tested)
- [ ] API tests cover create, save, version conflict, delete, and ownership isolation

## Blocked by

`02`
