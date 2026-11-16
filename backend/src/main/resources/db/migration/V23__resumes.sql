-- Resumes: a User's resume as an Item of type RESUME. The whole resume (contact details, sections, design) is one
-- jsonb document whose HTML fields are sanitised on every write. plain_text and markdown are derived from it on save,
-- for Search, Chat, Agents and Export. version counts saves, for the stale-save check.
alter table items drop constraint items_type_check;

alter table items add constraint items_type_check check (type in ('NOTE', 'ASSET', 'APPLICATION', 'RESUME'));

create table resume_contents (
    item_id    uuid    primary key references items (id) on delete cascade,
    document   jsonb   not null,
    plain_text text    not null default '',
    markdown   text    not null default '',
    version    integer not null default 1
);

alter table resume_contents enable row level security;
