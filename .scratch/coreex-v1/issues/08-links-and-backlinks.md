Status: ready-for-agent
Blocked by: 05

# 08 — Links and Backlinks

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

Typing `[[` in a Note opens autocomplete of the User's live Items by title, showing each one's type and Folder path. Choosing one inserts a Link stored as `[[<item-id>|<title>]]`. The editor renders Links as clickable using the target's **current** title, and opening a Link navigates to the Item. On every save, the backend re-parses the Note's Links into the Link index, resolving any hand-typed `[[Exact Title]]` to the single matching live Item. Unresolved Links (no match, an ambiguous match, or a trashed target) render differently. Every Item shows a Backlinks panel of the live Notes linking to it.

## Acceptance criteria

- [ ] Autocomplete appears on `[[`, filters as you type, and shows type and Folder path
- [ ] A Link keeps working and shows the new title after its target is renamed or moved (tested)
- [ ] Hand-typed `[[Exact Title]]` is rewritten to the stored id form when exactly one live Item matches; otherwise it stays unresolved
- [ ] Links to trashed or missing Items render as unresolved
- [ ] The Backlinks panel lists the live Notes linking to the Item, and clicking one opens it
- [ ] Links can never resolve to another User's Item (tested)
- [ ] Unit tests cover the Link parser (ids, titles, malformed brackets, code blocks); API tests cover Backlinks and resolution

## Blocked by

`05`
