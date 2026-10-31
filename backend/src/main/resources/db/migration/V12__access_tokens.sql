-- An Access token lets an Agent act for one User on /mcp. Only the SHA-256 hash of the token is kept, so a database
-- leak does not leak working tokens. Revoking sets revoked_at; the row stays so "last used" is not lost.
create table access_tokens (
    id           uuid        primary key default gen_random_uuid(),
    owner_id     uuid        not null references users (id) on delete cascade,
    name         text        not null check (char_length(name) between 1 and 60),
    token_hash   text        not null unique,
    created_at   timestamptz not null default now(),
    last_used_at timestamptz,
    expires_at   timestamptz,
    revoked_at   timestamptz
);

create index access_tokens_by_owner on access_tokens (owner_id);

alter table access_tokens enable row level security;
