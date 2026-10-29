-- The Trash looks up trashed rows by owner, by trash batch, and (for the purge job, across all Users) by age. The
-- existing indexes only cover live rows, so these partial indexes cover the trashed ones and stay small.
create index items_trashed_by_owner on items (owner_id, deleted_at) where deleted_at is not null;
create index items_trashed_by_age on items (deleted_at) where deleted_at is not null;
create index items_trash_batch on items (trash_batch_id) where trash_batch_id is not null;

create index folders_trashed_by_owner on folders (owner_id, deleted_at) where deleted_at is not null;
create index folders_trashed_by_age on folders (deleted_at) where deleted_at is not null;
create index folders_trash_batch on folders (trash_batch_id) where trash_batch_id is not null;
