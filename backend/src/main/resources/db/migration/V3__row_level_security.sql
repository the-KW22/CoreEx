-- Defence in depth: even if the `coreex` schema were ever exposed through Supabase's REST API, these tables
-- would answer nothing (RLS on, no policies). The backend connects as `postgres`, which bypasses RLS.
-- Every new table needs the same line in its migration (docs/DEVELOPMENT.md, section 10).
alter table users enable row level security;
alter table invites enable row level security;
