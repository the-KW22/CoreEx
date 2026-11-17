alter table cover_letter_contents add column sender_tsv tsvector generated always as (
    to_tsvector('simple', search_text(
        coalesce(document->'sender'->>'name', '') || ' ' || coalesce(document->'sender'->>'headline', '') || ' ' ||
        coalesce(document->'sender'->>'email', '') || ' ' || coalesce(document->'sender'->>'phone', '') || ' ' ||
        coalesce(document->'sender'->>'location', '') || ' ' || coalesce(document->'sender'->>'website', '')
    ))
) stored;
