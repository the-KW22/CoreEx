-- Note versions: the text a save replaced, so an earlier text can be read and brought back. edited_by names the
-- Access token that wrote that text (null: the User did) and saved_at is when it was written, not when it was kept.
-- Rows go with their Note when the Trash purges it, and with their User.
create table note_versions (
    id       uuid        primary key default gen_random_uuid(),
    owner_id uuid        not null references users (id) on delete cascade,
    item_id  uuid        not null references items (id) on delete cascade,
    title    text        not null,
    body     text        not null,
    edited_by text       check (char_length(edited_by) <= 60),
    saved_at timestamptz not null
);

create index note_versions_by_item on note_versions (item_id, saved_at desc);

create index note_versions_by_owner on note_versions (owner_id);

alter table note_versions enable row level security;
