create table resume_ai_reviews (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references users(id) on delete cascade,
    item_id uuid not null references items(id) on delete cascade,
    source_hash text not null,
    suggestions jsonb not null,
    created_at timestamptz not null default now()
);
create index resume_ai_reviews_owner_item on resume_ai_reviews (owner_id, item_id, created_at desc);
alter table resume_ai_reviews enable row level security;
