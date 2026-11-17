-- Resume versions: the document a save replaced, so an earlier Resume can be read and brought back. name is set on a
-- version the User named: those are never counted or removed by the clean-up. edited_by names the Access token that wrote
-- that document (null: the User did) and saved_at is when it was written, not when it was kept. Rows go with their
-- Resume when the Trash purges it, and with their User.
create table resume_versions (
    id        uuid        primary key default gen_random_uuid(),
    owner_id  uuid        not null references users (id) on delete cascade,
    item_id   uuid        not null references items (id) on delete cascade,
    title     text        not null,
    document  jsonb       not null,
    name      text        check (char_length(name) between 1 and 120),
    edited_by text        check (char_length(edited_by) <= 60),
    saved_at  timestamptz not null
);

create index resume_versions_by_item on resume_versions (item_id, saved_at desc);

create index resume_versions_by_owner on resume_versions (owner_id);

alter table resume_versions enable row level security;
