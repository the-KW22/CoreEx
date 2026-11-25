-- Someone who asked for an Invite from the public page. One row per email; the same answer is given whether or not
-- the email was new, so a row is never a sign that anyone has asked before (ADR 0004: only email and date are kept).
create table access_request (
    id          uuid        primary key default gen_random_uuid(),
    email       text        not null unique check (email = lower(email)),
    status      text        not null default 'OPEN' check (status in ('OPEN', 'INVITED', 'DISMISSED')),
    created_at  timestamptz not null default now(),
    resolved_at timestamptz
);

-- The Admin list shows open requests, newest first.
create index access_request_open_newest on access_request (created_at desc) where status = 'OPEN';

alter table access_request enable row level security;
