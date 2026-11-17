-- Career results (#274, #275): what a Career AI task made for an Application. It belongs to the Application's Item, so
-- it is hidden in the Trash and comes back with it, and is deleted when the Application is purged. The fingerprint is
-- the hash of the inputs it was made from; a changed fingerprint is how "Out of date" is shown.
create table career_results (
    id                uuid        primary key default gen_random_uuid(),
    owner_id          uuid        not null references users (id) on delete cascade,
    item_id           uuid        not null references items (id) on delete cascade,
    kind              text        not null check (kind in ('FIT')),
    data              jsonb       not null,
    evidence_ids      uuid[]      not null default '{}',
    input_fingerprint text        not null,
    input_tokens      bigint      not null default 0,
    output_tokens     bigint      not null default 0,
    created_at        timestamptz not null default now()
);
create index career_results_by_item on career_results (owner_id, item_id, created_at desc);
alter table career_results enable row level security;
