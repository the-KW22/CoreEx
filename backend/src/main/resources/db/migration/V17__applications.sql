-- Applications: a job the User tracks, as an Item of type APPLICATION. The Stage is one of six fixed values;
-- lane_id is empty for now and lets custom lanes come later without changing what a Stage means. The timeline is a
-- JSON array of entries, each with a server-assigned write sequence; day dates are stored at 12:00 UTC.
-- title_auto stays true until the User renames the Application, so the title follows company and role until then.
-- version counts saves, for the stale-save check.
alter table items drop constraint items_type_check;

alter table items add constraint items_type_check check (type in ('NOTE', 'ASSET', 'APPLICATION'));

create table application_contents (
    item_id      uuid        primary key references items (id) on delete cascade,
    company      text        not null check (char_length(company) between 1 and 90),
    role         text        not null check (char_length(role) between 1 and 90),
    location     text        not null default '' check (char_length(location) <= 200),
    posting_url  text        not null default '' check (char_length(posting_url) <= 2000),
    posting_text text        not null default '' check (char_length(posting_text) <= 100000),
    stage        text        not null default 'SAVED'
                             check (stage in ('SAVED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'CLOSED')),
    close_reason text        check (close_reason in ('ACCEPTED', 'NOT_SELECTED', 'WITHDREW', 'ACCEPTED_ANOTHER', 'NO_RESPONSE')),
    lane_id      uuid,
    applied_on   timestamptz,
    timeline     jsonb       not null default '[]',
    title_auto   boolean     not null default true,
    version      integer     not null default 1
);

alter table application_contents enable row level security;
