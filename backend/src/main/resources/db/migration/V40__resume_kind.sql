-- A Resume's kind (#370): RESUME is the default; a CV is the User's master document and is never linked to an Application.
alter table resume_contents add column kind text not null default 'RESUME' check (kind in ('RESUME', 'CV'));
