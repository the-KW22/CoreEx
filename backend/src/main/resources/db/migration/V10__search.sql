-- Trigram matching for the quick switcher (typos). A fresh database gets the extension in this schema (the first one
-- on the search path), but a Supabase project may already have it, typically in its "extensions" schema, and then
-- "create extension if not exists" does nothing and an unqualified operator class is not found. So the index below is
-- built with the schema the extension actually lives in, and the application's search path includes "extensions"
-- (spring.datasource.hikari.connection-init-sql) so its operators and functions are found there too.
do $$
declare
    trgm_schema text;
begin
    select n.nspname into trgm_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
    if trgm_schema is null then
        create extension pg_trgm;
        select n.nspname into trgm_schema
        from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
    end if;
    execute format('create index items_title_trgm on items using gin (title %I.gin_trgm_ops) where deleted_at is null',
        trgm_schema);
end $$;

-- The default text search parser keeps "budget.png" and "Q3_report-final.v2.pdf" as one word, so searching for
-- "budget" would miss a file of that name. Separators between words are turned into spaces, on the indexed text and
-- on the query alike. A hyphen is only a separator between two word characters, so "-excluded" still excludes.
-- A slash is deliberately not one: turning "</script>" into "< script>" makes the parser drop the text after it.
create function search_text(t text) returns text
    language sql immutable parallel safe
as $$ select regexp_replace(coalesce(t, ''), '[._]+|(?<=\w)-+(?=\w)', ' ', 'g') $$;

-- Search vectors, kept up to date by Postgres. The "simple" configuration lowercases but does not stem or drop
-- stop words, so words in any language are found as written. Only the first 200,000 characters of a Note are indexed:
-- a tsvector is limited to 1 MB and a 1,000,000 character Note of unique words could exceed it and fail the save.
alter table items add column title_tsv tsvector
    generated always as (to_tsvector('simple', search_text(title))) stored;
alter table note_contents add column body_tsv tsvector
    generated always as (to_tsvector('simple', search_text(left(body, 200000)))) stored;
alter table asset_files add column description_tsv tsvector
    generated always as (to_tsvector('simple', search_text(description))) stored;

-- When the User last opened the Item, for "recently opened" in the quick switcher. Null means never.
alter table items add column last_opened_at timestamptz;

create index items_recently_opened on items (owner_id, last_opened_at desc)
    where deleted_at is null and last_opened_at is not null;
