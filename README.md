# CoreEx

A personal knowledge base: write Markdown Notes, upload Assets, organize them with Folders and Tags, and connect them with Links. Terms are defined in [CONTEXT.md](CONTEXT.md), decisions in [docs/adr/](docs/adr/), and how we work in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

| Folder | What |
|---|---|
| `backend/` | Spring Boot REST API (Java 21, Maven). Owns all business rules and the database. |
| `frontend/` | Next.js UI (TypeScript). Calls only the API, through a client generated from its OpenAPI spec. |
| `supabase/` | Local Supabase config (Postgres, Auth, Storage in Docker). |

## Prerequisites

JDK 21, Node.js 24, Docker Desktop (running), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

## Run locally

1. **Start local Supabase** (first run downloads images):

   ```bash
   supabase start
   ```

   Stop it with `supabase stop`. Postgres listens on `localhost:54322`.

2. **Start the backend** (port 8080). Copy `backend/.env.example` to `backend/.env`, load those variables into your shell, then run:

   ```bash
   cd backend
   ./mvnw spring-boot:run
   ```

   Flyway migrates the database on start. Check it: <http://localhost:8080/api/health> and the spec at <http://localhost:8080/v3/api-docs>.

3. **Start the frontend** (port 3000). Copy `frontend/.env.example` to `frontend/.env.local`, then:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Open <http://localhost:3000>. It shows the API's health status.

## API client

The frontend client types are generated from `backend/openapi.json`. After changing the API, run the backend tests (they rewrite the spec), then regenerate the client and commit both:

```bash
cd backend && ./mvnw test
cd ../frontend && npm run generate
```

Never edit `frontend/lib/api/schema.d.ts` by hand.

## Tests

```bash
cd backend
./mvnw test
```

API tests start the real app against a Testcontainers Postgres, so Docker must be running. They do not touch local Supabase.

Frontend checks: `npm run typecheck`, `npm run lint`, `npm run build` (in `frontend/`).

## Configuration

No secrets are committed. Each app has an `.env.example` listing its variables. The local Supabase values in `backend/.env.example` are the fixed, public defaults of `supabase start`.
