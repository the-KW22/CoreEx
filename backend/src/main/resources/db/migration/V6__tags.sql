-- A Tag belongs to one User. Names are unique per User ignoring case ("Research" and "research" are one Tag),
-- and keep the casing they were first typed with. item_tags links Tags to Items; deleting either side removes
-- only the links.
create table tags (
    id         uuid        primary key default gen_random_uuid(),
    owner_id   uuid        not null references users (id) on delete cascade,
    name       text        not null check (char_length(name) between 1 and 50),
    created_at timestamptz not null default now()
);

create unique index tags_owner_name on tags (owner_id, lower(name));

create table item_tags (
    item_id uuid not null references items (id) on delete cascade,
    tag_id  uuid not null references tags (id) on delete cascade,
    primary key (item_id, tag_id)
);

create index item_tags_by_tag on item_tags (tag_id);

alter table tags enable row level security;
alter table item_tags enable row level security;
