Status: ready-for-agent
Blocked by: 05

# 06 — Folders: nested tree, move, delete to Trash

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

Users organize Items into nested Folders. The sidebar shows a collapsible Folder tree. Users can create, rename, and move Folders (drag and drop or a menu), move Items between Folders or to the top level, and create a new Note inside the Folder they're viewing. Moving a Folder into itself or a descendant is refused with `FOLDER_CYCLE`. Deleting a Folder shows how many Folders and Items it contains, then soft-deletes the whole subtree under one trash batch.

## Acceptance criteria

- [ ] Folders nest to any depth, and the tree renders and collapses in the sidebar
- [ ] Items can be moved into any Folder or back to the top level; each Item is in at most one Folder
- [ ] Moving a Folder into itself or its subtree gets FOLDER_CYCLE
- [ ] The delete confirmation shows correct Folder and Item counts; afterwards the whole subtree is hidden and shares one trash batch
- [ ] Folder listings only show live Items
- [ ] API tests cover nesting, moves, the cycle check, subtree delete, and ownership isolation

## Blocked by

`05`
