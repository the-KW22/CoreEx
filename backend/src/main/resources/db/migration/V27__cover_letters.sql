-- A Cover Letter is an Item with a saved copy of the linked Resume's sender and design.
alter table items drop constraint items_type_check;
alter table items add constraint items_type_check check (type in ('NOTE', 'ASSET', 'APPLICATION', 'RESUME', 'COVER_LETTER'));

create table cover_letter_contents (
    item_id uuid primary key references items(id) on delete cascade,
    linked_resume_id uuid references items(id) on delete set null,
    document jsonb not null,
    plain_text text not null default '',
    markdown text not null default '',
    version integer not null default 1,
    plain_tsv tsvector generated always as (to_tsvector('simple', search_text(left(plain_text, 200000)))) stored,
    embedded_updated_at timestamptz
);

create index cover_letter_linked_resume on cover_letter_contents (linked_resume_id) where linked_resume_id is not null;
alter table cover_letter_contents enable row level security;

create table cover_letter_versions (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references users(id) on delete cascade,
    item_id uuid not null references items(id) on delete cascade,
    title text not null,
    document jsonb not null,
    name text check (char_length(name) between 1 and 120),
    saved_at timestamptz not null default now()
);
create index cover_letter_versions_by_item on cover_letter_versions (item_id, saved_at desc);
create index cover_letter_versions_by_owner on cover_letter_versions (owner_id);
alter table cover_letter_versions enable row level security;
