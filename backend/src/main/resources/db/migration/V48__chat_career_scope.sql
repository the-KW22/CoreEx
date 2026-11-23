-- Career scope (#289, #290). V41 made chats.scope with the value 'general' only; the scopes are now GENERAL, CAREER and
-- APPLICATION, and a Chat's scope is fixed when it is made. An APPLICATION Chat names its Application; the id is not a
-- foreign key, so Chat does not depend on the Applications table.
alter table chats drop constraint if exists chats_scope_check;
update chats set scope = 'GENERAL' where scope = 'general';
alter table chats alter column scope set default 'GENERAL';
alter table chats add constraint chats_scope_check check (scope in ('GENERAL', 'CAREER', 'APPLICATION'));
alter table chats add column application_id uuid;
alter table chats add column use_applications boolean not null default true;
alter table chats add column use_knowledge boolean not null default true;
alter table chats add constraint chats_application_matches_scope check ((scope = 'APPLICATION') = (application_id is not null));

-- A Fact can now come from the User's own words in a Chat (#290). V33 left the check unnamed, so it has its default name.
alter table facts drop constraint if exists facts_source_kind_check;
alter table facts add constraint facts_source_kind_check check (source_kind in ('MANUAL', 'RESUME', 'NOTE', 'CHAT'));
