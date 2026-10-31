-- Which Access token made an Item's latest content change (its name, as it was then). Null means the User did.
-- The User's own saves clear it, so it always names whoever edited last.
alter table items add column edited_by text check (char_length(edited_by) <= 60);
