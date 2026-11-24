-- Chats (issue #380): a saved conversation with the model, owned by one User. The scope is fixed when the Chat is made;
-- only 'general' exists so far. claimed_at is the claim of the reply that is running: one reply at a time per Chat, and
-- a claim older than the stale-claim setting counts as released. A message's content is a JSON list of content blocks,
-- the shape the model receives; tool results are stored as USER rows so the history can be replayed to the model.
create table chats (
    id           uuid        primary key default gen_random_uuid(),
    owner_id     uuid        not null references users (id) on delete cascade,
    scope        text        not null default 'general' check (scope in ('general')),
    title        text        not null default 'New chat' check (char_length(title) <= 200),
    created_at   timestamptz not null default now(),
    last_used_at timestamptz not null default now(),
    claimed_at   timestamptz
);

create index chats_owner_last_used on chats (owner_id, last_used_at desc);

create table chat_messages (
    id         uuid        primary key default gen_random_uuid(),
    chat_id    uuid        not null references chats (id) on delete cascade,
    position   integer     not null check (position > 0),
    role       text        not null check (role in ('USER', 'ASSISTANT')),
    content    jsonb       not null default '[]',
    status     text        not null default 'COMPLETE'
               check (status in ('STREAMING', 'COMPLETE', 'STOPPED', 'FAILED')),
    error_code text,
    created_at timestamptz not null default now(),
    unique (chat_id, position)
);

alter table chats enable row level security;
alter table chat_messages enable row level security;
