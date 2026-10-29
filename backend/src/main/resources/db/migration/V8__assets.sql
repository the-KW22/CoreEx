-- A User's Storage Quota in bytes. Null means "the configured default", so changing the default needs no migration
-- and the Admin can later give one User more room.
alter table users add column storage_quota_bytes bigint check (storage_quota_bytes >= 0);

-- An Asset is an items row (type ASSET, the title defaults to the filename) plus its file's facts. The file itself
-- lives in Storage under storage_key. Usage counts these sizes, including Assets in the Trash.
create table asset_files (
    item_id     uuid   primary key references items (id) on delete cascade,
    storage_key text   not null unique,
    mime_type   text   not null,
    size_bytes  bigint not null check (size_bytes >= 0),
    description text   not null default '' check (char_length(description) <= 2000)
);

-- An upload that has an intent but no confirmation yet. It is not an Item, so it can never show up in lists, search,
-- Tags or Links. Confirming turns it into an Asset; one still here after 24 hours is removed with its object.
create table pending_uploads (
    id          uuid        primary key default gen_random_uuid(),
    owner_id    uuid        not null references users (id) on delete cascade,
    folder_id   uuid,
    storage_key text        not null unique,
    filename    text        not null,
    mime_type   text        not null,
    size_bytes  bigint      not null check (size_bytes > 0),
    created_at  timestamptz not null
);

create index pending_uploads_by_age on pending_uploads (created_at);

alter table asset_files enable row level security;
alter table pending_uploads enable row level security;
