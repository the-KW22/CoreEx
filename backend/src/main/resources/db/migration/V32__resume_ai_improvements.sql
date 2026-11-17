create table resume_ai_improvements (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references users(id) on delete cascade,
    item_id uuid not null references items(id) on delete cascade,
    field text not null,
    original text not null,
    suggestion text not null,
    source_hash text not null,
    created_at timestamptz not null default now()
);
create index resume_ai_improvements_owner_item on resume_ai_improvements (owner_id, item_id);
alter table resume_ai_improvements enable row level security;
