-- The web pages an assistant message retrieved with the provider's web tools (issue #205): {url, title} entries, http and https
-- only, kept with the message so the screen can list them. Null when the message used no web tools.
alter table chat_messages add column web_sources jsonb;
