-- A User's id is the Supabase auth user id (the token's `sub`). Emails are stored lowercase.
create table users (
    id             uuid        primary key,
    email          text        not null unique check (email = lower(email)),
    role           text        not null check (role in ('ADMIN', 'USER')),
    status         text        not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
    created_at     timestamptz not null default now(),
    last_active_at timestamptz
);

create table invites (
    id          uuid        primary key default gen_random_uuid(),
    email       text        not null check (email = lower(email)),
    status      text        not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REVOKED')),
    created_at  timestamptz not null default now(),
    accepted_at timestamptz
);

-- One live Invite per email; revoked and accepted ones stay as history.
create unique index invites_one_pending_per_email on invites (email) where status = 'PENDING';
