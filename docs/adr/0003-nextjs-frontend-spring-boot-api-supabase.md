# Next.js frontend, Spring Boot REST API, Supabase for Postgres/Auth/Storage

CoreEx is two apps: a Next.js frontend that is UI-only, and a Spring Boot REST API that owns every business rule (Folders, Trash, Links, Tags, Import) and is the only thing that touches the database. Supabase provides Postgres, Auth, and Storage. We chose a separate Java backend over an all-Next.js app because learning Spring Boot is an explicit goal of the project, and because a single REST API that every client goes through — the web app now, the MCP server in V1.5 — enforces one source of truth and keeps per-User scoping (ADR 0001) in one place.

## Considered Options

- **All-Next.js (route handlers + Supabase)** — faster to ship, one language and deploy; rejected because it doesn't serve the Spring learning goal and makes it easy for UI code to bypass the service layer.

## Consequences

- The frontend never queries Supabase Postgres directly; it calls the REST API only.
- Supabase Auth handles sign-up/login; Spring Security validates the Supabase-issued JWT on every request.
- Asset bytes go to Supabase Storage via short-lived signed URLs issued by the API after an ownership check.
- The API publishes an OpenAPI spec; the frontend's TypeScript client is generated from it so the two sides can't drift.
- The API needs JVM-capable hosting (not Vercel), e.g. Render/Railway/Fly.io.
