-- A locked Resume cannot be saved or renamed until it is unlocked; the lock is a rule of the API, not only of the editor.
alter table resume_contents add column locked boolean not null default false;
