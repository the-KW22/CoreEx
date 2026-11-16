create table cover_letter_drafts (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references users(id) on delete cascade,
    item_id uuid not null references items(id) on delete cascade,
    mode text not null check (mode in ('DRAFT', 'SHORTER', 'PERSONAL')),
    base_version integer not null,
    application_id uuid references items(id) on delete set null,
    application_version integer not null,
    resume_id uuid references items(id) on delete set null,
    resume_version integer not null,
    body text not null,
    input_hash text not null,
    accepted_at timestamptz,
    created_at timestamptz not null default now()
);
create index cover_letter_drafts_by_item on cover_letter_drafts (item_id, created_at desc);
create index cover_letter_drafts_by_owner on cover_letter_drafts (owner_id);
alter table cover_letter_drafts enable row level security;
