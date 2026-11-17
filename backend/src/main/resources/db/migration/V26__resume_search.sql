alter table resume_contents add column plain_tsv tsvector
    generated always as (to_tsvector('simple', search_text(left(plain_text, 200000)))) stored;

alter table resume_contents add column embedded_updated_at timestamptz;
