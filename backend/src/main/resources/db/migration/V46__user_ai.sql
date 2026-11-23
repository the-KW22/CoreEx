-- A User's own AI settings (issue #203): the Chat model they picked and their own Anthropic key. The key is encrypted by
-- the API (AiKeyVault) and never stored in clear; the last four characters are kept so the screens can show it.
create table user_ai_settings (
    owner_id       uuid        primary key references users (id) on delete cascade,
    chat_model     text        check (chat_model is null or char_length(chat_model) <= 100),
    key_provider   text,
    key_ciphertext bytea,
    key_last4      text,
    updated_at     timestamptz not null default now(),
    constraint user_ai_key_all_or_none check (
        (key_provider is null and key_ciphertext is null and key_last4 is null)
        or (key_provider is not null and key_ciphertext is not null and key_last4 is not null))
);

alter table user_ai_settings enable row level security;
