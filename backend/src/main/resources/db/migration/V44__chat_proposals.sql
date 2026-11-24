-- Proposals (issue #199): a change to the knowledge base that the model in a Chat offers and the User approves or rejects.
-- Nothing is applied when the model calls a write tool; a row waits here as PENDING until the User answers. batch_id is
-- the reply that made it (one approval can cover a batch, all or nothing). For a Note tool, before_text and after_text
-- are the Note's text then and as it would be, which the screen shows as a diff. result is what the tool returned once
-- applied. A Proposal leaves with its Chat.
create table chat_proposals (
    id          uuid        primary key default gen_random_uuid(),
    seq         bigint      generated always as identity,
    chat_id     uuid        not null references chats (id) on delete cascade,
    message_id  uuid        not null references chat_messages (id) on delete cascade,
    batch_id    uuid        not null,
    tool_use_id text        not null,
    tool        text        not null,
    label       text        not null,
    input       jsonb       not null,
    target_id   uuid,
    before_text text,
    after_text  text,
    status      text        not null default 'PENDING' check (status in ('PENDING', 'APPLIED', 'REJECTED', 'REPLACED')),
    result      text,
    created_at  timestamptz not null default now(),
    answered_at timestamptz,
    unique (chat_id, tool_use_id)
);

create index chat_proposals_chat on chat_proposals (chat_id, seq);

alter table chat_proposals enable row level security;
