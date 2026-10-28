-- Folders nest through parent_id (null = top level). Deleting sets deleted_at and one trash_batch_id on the
-- whole live subtree, so a restore can bring it back together. An Item is in at most one Folder (folder_id).
create table folders (
    id             uuid        primary key default gen_random_uuid(),
    owner_id       uuid        not null references users (id) on delete cascade,
    parent_id      uuid        references folders (id) on delete cascade,
    name           text        not null check (char_length(name) between 1 and 200),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    deleted_at     timestamptz,
    trash_batch_id uuid
);

create index folders_owner_parent on folders (owner_id, parent_id) where deleted_at is null;

alter table items add column folder_id uuid references folders (id) on delete set null;

create index items_folder on items (owner_id, folder_id) where deleted_at is null;

alter table folders enable row level security;
