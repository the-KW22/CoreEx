-- Chat retrieval (issue #382): the Chunks Semantic search found for a User's message are stored with that message, so the
-- Chat keeps what it quoted and sends the same quotes with later turns. use_notes remembers the Use my Notes switch of
-- the Chat; quotes is null on every row that quotes nothing.
alter table chats add column use_notes boolean not null default true;
alter table chat_messages add column quotes jsonb;
