-- Items are what a User keeps: Notes now, Assets later. Deleting sets deleted_at (the Trash UI comes later);
-- trash_batch_id lets a Folder delete take its whole subtree out and bring it back together.
-- A Folder column arrives with Folders.
create table items (
    id             uuid        primary key default gen_random_uuid(),
    owner_id       uuid        not null references users (id) on delete cascade,
    type           text        not null check (type in ('NOTE', 'ASSET')),
    title          text        not null default '' check (char_length(title) <= 200),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    deleted_at     timestamptz,
    trash_batch_id uuid
);

create index items_owner_live_by_updated on items (owner_id, updated_at desc) where deleted_at is null;

-- The Markdown exactly as the User wrote it (ADR 0002). version counts saves, for the stale-save check.
create table note_contents (
    item_id uuid    primary key references items (id) on delete cascade,
    body    text    not null default '',
    version integer not null default 1
);

alter table items enable row level security;
alter table note_contents enable row level security;
