-- Career Interviews (#279-#281): interview prep, practice attempts and debrief summaries are Career results; a Debrief
-- is what the User records after one interview of an Application. The interview is an entry of the Application's JSON
-- timeline, so interview_seq cannot be a foreign key: the service checks it, and a Debrief whose interview was
-- deleted is hidden. A Debrief belongs to the Application's Item and leaves and returns with it.
alter table career_results drop constraint career_results_kind_check;
alter table career_results add constraint career_results_kind_check
    check (kind in ('FIT', 'DRAFT', 'TIGHTEN', 'PREP', 'PRACTICE', 'DEBRIEF'));

create table interview_debriefs (
    item_id       uuid        not null references items (id) on delete cascade,
    interview_seq integer     not null,
    owner_id      uuid        not null references users (id) on delete cascade,
    notes         text        not null default '' check (length(notes) <= 10000),
    -- [{question, landed (WELL, MIXED, POORLY), note}], at most 30
    questions     jsonb       not null default '[]',
    version       integer     not null default 1,
    updated_at    timestamptz not null default now(),
    primary key (item_id, interview_seq)
);
alter table interview_debriefs enable row level security;
