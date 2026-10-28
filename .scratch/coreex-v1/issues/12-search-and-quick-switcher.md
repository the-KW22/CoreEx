Status: ready-for-agent
Blocked by: 07, 09

# 12 — Search and the Ctrl+K quick switcher

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

A search page finds live Items by Note title and content, Asset title and description, and Tag name, using Postgres full-text search with the `simple` configuration. Results can be filtered by Folder, Tag, and type, and show highlighted snippets. `Ctrl+K` / `Cmd+K` opens a quick switcher that matches titles by prefix or fuzzy match (trigram), shows recently opened Items before you type, and opens the chosen Item.

## Acceptance criteria

- [ ] Search matches Note bodies, titles, Asset descriptions, and Tag names; trashed Items never appear
- [ ] Folder, Tag, and type filters combine correctly
- [ ] Results show highlighted snippets
- [ ] The quick switcher opens from anywhere with Ctrl/Cmd+K, tolerates typos, and shows recently opened Items when empty
- [ ] Non-English text (for example Malay) is found by its exact words
- [ ] API tests cover matching, filters, trashed exclusion, and ownership isolation

## Blocked by

`07`, `09`
