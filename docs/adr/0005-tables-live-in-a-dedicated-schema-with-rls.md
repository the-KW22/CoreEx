# CoreEx tables live in a dedicated `coreex` schema with row level security

Every CoreEx table is created in a `coreex` schema, not in `public`, and has row level security turned on with no policies. Supabase exposes every table in `public` through its REST API, and the publishable key is public by design, so tables left there would be reachable without the Spring API, which breaks ADR 0003 and the per-User privacy of ADR 0001. A separate schema is not exposed by default, RLS keeps the tables closed even if that changes, and Flyway ignores whatever else Supabase puts in `public`. The backend connects as `postgres`, which bypasses RLS, so the API is unaffected.

## Considered Options

- **Keep tables in `public` and rely on RLS alone**: rejected because one forgotten `enable row level security` would expose a table to the world.
- **Keep tables in `public` and turn off Supabase's Data API**: rejected because it is a dashboard setting that is easy to change back and is not checked by any test.

## Consequences

- Flyway runs with `schemas=coreex` and the connection pool sets `schema=coreex`, so migrations and queries use plain table names.
- Each new table's migration must enable row level security; `SchemaApiTest` fails the build if a table lacks it or lands in `public`.
- Databases created before this decision keep old copies of `users` and `invites` in `public`. They are unused and can be dropped (`supabase db reset` locally).
