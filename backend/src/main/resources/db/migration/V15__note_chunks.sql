-- Semantic search (ADR 0008): the Chunks of every Note with their embeddings, kept up to date by a sweep in the API.
--
-- The vector extension may already be installed by Supabase, typically in its "extensions" schema, and a fresh
-- database gets it in the first schema on the search path. Either way the types below are found, because this
-- transaction's search path is set to the schema the extension actually lives in (the same trouble as pg_trgm in V10).
do $$
declare
    vector_schema text;
begin
    select n.nspname into vector_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
    if vector_schema is null then
        create extension vector;
        select n.nspname into vector_schema
        from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector';
    end if;
    perform set_config('search_path', 'coreex, ' || quote_ident(vector_schema), true);
end $$;

-- A piece of a Note, about 250 words, and its vector. The hash of the text tells the sweep whether the piece
-- changed; the model name tells it whether the vector still compares with the others. halfvec stores two bytes per
-- number, half of vector, with almost no loss in search quality. owner_id is what every search is scoped by.
create table note_chunks (
    id           uuid         primary key default gen_random_uuid(),
    owner_id     uuid         not null references users (id) on delete cascade,
    note_id      uuid         not null references items (id) on delete cascade,
    position     integer      not null,
    content      text         not null,
    content_hash text         not null,
    model        text         not null,
    embedding    halfvec(384) not null,
    created_at   timestamptz  not null default now()
);

create index note_chunks_by_note on note_chunks (note_id);

create index note_chunks_by_owner on note_chunks (owner_id);

create index note_chunks_embedding on note_chunks using hnsw (embedding halfvec_cosine_ops);

alter table note_chunks enable row level security;

-- The updated_at the Note had when its Chunks were last made current. Null means never; a Note is due when this
-- differs from its updated_at, so an edit that lands while a Note is being embedded is still caught.
alter table note_contents add column embedded_updated_at timestamptz;
