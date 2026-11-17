-- Career Knowledge (#270-#273). A Fact is the User's own true statement, kept apart from Items. A pulled Fact keeps
-- its source (Resume or Note) and the exact quote. Forgetting a Fact deletes it, its revisions and its text, and leaves
-- only a tombstone holding the source key, so the same source text cannot bring it back.
create table facts (
    id          uuid        primary key default gen_random_uuid(),
    owner_id    uuid        not null references users (id) on delete cascade,
    text        text        not null check (char_length(text) between 1 and 2000),
    category    text        not null check (category in ('EXPERIENCE', 'SKILL', 'ACHIEVEMENT', 'EDUCATION', 'OTHER')),
    source_kind text        not null default 'MANUAL' check (source_kind in ('MANUAL', 'RESUME', 'NOTE')),
    source_id   uuid,
    quote       text        check (char_length(quote) <= 2000),
    source_key  text,
    status      text        not null default 'ACTIVE' check (status in ('ACTIVE', 'OFF')),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    check ((source_kind = 'MANUAL') = (source_key is null))
);
create unique index facts_source_key_once on facts (owner_id, source_key) where source_key is not null;
create index facts_by_owner on facts (owner_id, category, status);
alter table facts enable row level security;

create table fact_revisions (
    id       uuid        primary key default gen_random_uuid(),
    owner_id uuid        not null references users (id) on delete cascade,
    fact_id  uuid        not null references facts (id) on delete cascade,
    text     text        not null,
    saved_at timestamptz not null default now()
);
create index fact_revisions_by_fact on fact_revisions (fact_id, saved_at);
alter table fact_revisions enable row level security;

-- Content-free: only the owner and the source key of a forgotten Fact.
create table fact_tombstones (
    owner_id   uuid        not null references users (id) on delete cascade,
    source_key text        not null,
    primary key (owner_id, source_key)
);
alter table fact_tombstones enable row level security;

-- Preferences: one row per User. Currency and pay period are required with a minimum base pay.
create table career_preferences (
    owner_id          uuid          primary key references users (id) on delete cascade,
    target_roles      text          not null default '' check (char_length(target_roles) <= 500),
    places            text[]        not null default '{}',
    min_base_pay      numeric(14, 2) check (min_base_pay is null or min_base_pay >= 0),
    currency          text          check (char_length(currency) = 3),
    pay_period        text          check (pay_period in ('YEAR', 'MONTH', 'HOUR')),
    office_days       integer       check (office_days between 0 and 7),
    notice_period     text          not null default '' check (char_length(notice_period) <= 100),
    updated_at        timestamptz   not null default now(),
    check (min_base_pay is null or (currency is not null and pay_period is not null))
);
alter table career_preferences enable row level security;

-- A Story is a Note with this flag set (ADR 0002: the Note stays a normal Note).
alter table note_contents add column story boolean not null default false;
