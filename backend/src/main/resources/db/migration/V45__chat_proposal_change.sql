-- The words a Proposal's card shows for an organising change (move, tags, Trash, rename): what it is about and its state
-- before and after. Null for Note tools (their before_text and after_text do that) and for creates.
alter table chat_proposals add column change_subject text, add column change_before text, add column change_after text;
