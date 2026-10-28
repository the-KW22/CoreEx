Status: ready-for-agent
Blocked by: 06, 09

# 11 — Trash: view, restore, delete forever, 30-day purge

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

A Trash view lists deleted Items and Folders with the days remaining before permanent removal. Restoring an Item also restores any trashed ancestor Folders, but not their other contents. Restoring a Folder restores its whole trash batch. "Delete forever" and "Empty Trash" permanently remove things now, including Asset objects in Storage, which frees quota. A daily scheduled job permanently removes anything trashed more than 30 days ago. Links to restored Items resolve again.

## Acceptance criteria

- [ ] The Trash lists trashed Items and Folders with days remaining
- [ ] Restoring an Item restores its trashed ancestor chain; restoring a Folder restores exactly its batch
- [ ] Delete forever and Empty Trash remove database rows and Storage objects, and quota usage drops accordingly
- [ ] The purge job removes only things trashed more than 30 days ago (tested with a controllable clock)
- [ ] A Link to an Item becomes resolved again after the Item is restored (tested)
- [ ] API tests cover each restore rule, permanent deletion, purge, and ownership isolation

## Blocked by

`06`, `09`
