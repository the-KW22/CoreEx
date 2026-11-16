-- Applications in Search, Semantic search and Chat (#240): the plain text of an Application is its company, role,
-- location, posting and the notes and interview notes on its timeline. A trigger keeps it current, so every writer
-- (REST, bulk, MCP) is covered without each one remembering to. The search vector is generated from it, as for Notes.
-- embedded_updated_at is the updated_at the Application had when its Chunks were last made current (as on Notes).
alter table application_contents add column plain_text text not null default '';

alter table application_contents add column plain_tsv tsvector
    generated always as (to_tsvector('simple', search_text(left(plain_text, 200000)))) stored;

alter table application_contents add column embedded_updated_at timestamptz;

create function application_plain_text() returns trigger
    language plpgsql
as $$
begin
    new.plain_text := concat_ws(E'\n', new.company, new.role, nullif(new.location, ''), nullif(new.posting_text, ''),
        (select string_agg(e ->> 'text', E'\n')
         from jsonb_array_elements(new.timeline) e
         where e ->> 'type' in ('NOTE', 'INTERVIEW') and coalesce(e ->> 'text', '') <> ''));
    return new;
end
$$;

create trigger application_plain_text before insert or update of company, role, location, posting_text, timeline
    on application_contents for each row execute function application_plain_text();

-- Existing rows: naming a column in the SET list fires the trigger, even for an unchanged value.
update application_contents set company = company;
