-- Career replies (#284): a REPLY result proposes changes to its Application (a Stage, a follow-up reminder or Offer terms).
-- Each change the User applies is recorded here with its exact before and after, so it can be undone. A change belongs to
-- its result and the Application's Item, and leaves with them. offer_id has no foreign key: an undone Offer keeps its record.
create table career_changes (
    result_id         uuid        not null references career_results (id) on delete cascade,
    idx               integer     not null,
    owner_id          uuid        not null references users (id) on delete cascade,
    item_id           uuid        not null references items (id) on delete cascade,
    kind              text        not null check (kind in ('STAGE', 'FOLLOW_UP', 'OFFER')),
    before            jsonb       not null,
    after             jsonb       not null,
    resulting_version integer     not null,
    offer_id          uuid        null,
    applied_at        timestamptz not null default now(),
    undone_at         timestamptz null,
    primary key (result_id, idx)
);
create index career_changes_owner_id_idx on career_changes (owner_id);
alter table career_changes enable row level security;
