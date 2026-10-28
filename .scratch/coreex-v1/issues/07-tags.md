Status: ready-for-agent
Blocked by: 05

# 07 — Tags on Items

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

Users add Tags to any Item, picking from existing Tags or creating a new one by typing. Tag names are unique per User and case-insensitive. A Tags view lists all Tags with Item counts, and opening a Tag lists its Items. Tags can be renamed or deleted everywhere at once, and removed from a single Item.

## Acceptance criteria

- [ ] Tags can be added to and removed from Items, with autocomplete from the User's existing Tags
- [ ] `Research` and `research` resolve to the same Tag
- [ ] The Tags view shows counts of live Items only; the Tag page lists its live Items
- [ ] Renaming a Tag to a name the User already has is refused with a clear error (no silent merge)
- [ ] Deleting a Tag removes it from all Items without touching the Items
- [ ] API tests cover case-insensitivity, rename, delete, counts, and ownership isolation

## Blocked by

`05`
