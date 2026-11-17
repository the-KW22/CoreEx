-- Career Apply (#276-#278): an employer form's questions and answers, the answer library, and the receipt of what was
-- sent. Questions and receipts belong to the Application's Item, so they leave with it; library answers belong to the
-- User (a "this job only" one also leaves with its Application).
create table application_questions (
    id          uuid        primary key default gen_random_uuid(),
    owner_id    uuid        not null references users (id) on delete cascade,
    item_id     uuid        not null references items (id) on delete cascade,
    position    integer     not null,
    question    text        not null check (length(question) between 1 and 1000),
    limit_unit  text        check (limit_unit in ('WORDS', 'CHARS')),
    limit_value integer     check (limit_value > 0),
    answer      text        not null default '' check (length(answer) <= 20000),
    version     integer     not null default 1,
    created_at  timestamptz not null default now(),
    check ((limit_unit is null) = (limit_value is null))
);
create index application_questions_by_item on application_questions (owner_id, item_id, position, id);
alter table application_questions enable row level security;

create table answer_library (
    id         uuid        primary key default gen_random_uuid(),
    owner_id   uuid        not null references users (id) on delete cascade,
    scope      text        not null check (scope in ('REUSABLE', 'EMPLOYER', 'JOB')),
    -- The lower-cased company for EMPLOYER, the Application for JOB, nothing for REUSABLE.
    company    text,
    item_id    uuid        references items (id) on delete cascade,
    question   text        not null,
    answer     text        not null,
    created_at timestamptz not null default now(),
    check ((scope = 'EMPLOYER') = (company is not null) and (scope = 'JOB') = (item_id is not null))
);
create index answer_library_by_owner on answer_library (owner_id, created_at desc);
alter table answer_library enable row level security;

-- What Mark as applied recorded; the sent Resume and Cover Letter are kept in application_linked_documents.
create table application_submissions (
    item_id  uuid        primary key references items (id) on delete cascade,
    owner_id uuid        not null references users (id) on delete cascade,
    answers  jsonb       not null,
    sent_at  timestamptz not null default now()
);
alter table application_submissions enable row level security;

-- Draft and Tighten results hold the proposed text until the User accepts or rejects it.
alter table career_results drop constraint career_results_kind_check;
alter table career_results add constraint career_results_kind_check check (kind in ('FIT', 'DRAFT', 'TIGHTEN'));
alter table career_results add column resolution text check (resolution in ('ACCEPTED', 'REJECTED'));
