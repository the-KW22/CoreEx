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

   Stop it with `supabase stop`. Postgres listens on `localhost:54322`. `supabase status` shows the local API URL and keys.

2. **Start the backend** (port 8080). Copy `backend/.env.example` to `backend/.env`, set `OWNER_EMAIL` to the email you will sign up with, load those variables into your shell, then run:

   ```bash
   cd backend
   ./mvnw spring-boot:run
   ```

   Flyway migrates the database on start. Check it: <http://localhost:8080/api/health> and the spec at <http://localhost:8080/v3/api-docs>.

3. **Start the frontend** (port 3000). Copy `frontend/.env.example` to `frontend/.env.local` and put the Publishable key from `supabase status` in `SUPABASE_PUBLISHABLE_KEY`, then:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Sign in.** Open <http://localhost:3000>, choose **Create account** with the `OWNER_EMAIL` address, and you land in the app as Admin. Sign-in is email and password only for now.

CoreEx's tables live in the `coreex` schema (ADR 0005). If you ran an older version, `public.users` and `public.invites` are unused leftovers; `supabase db reset` clears them.

### Inviting someone

CoreEx is invite-only. Sign in as the owner (`OWNER_EMAIL`), open **Admin** in the sidebar, enter the person's email and select **Create Invite**. Use **Copy sign-up link** and send it to them; the link opens the sign-up page with their email filled in. An Invite can be revoked while it is pending. Without a pending Invite a person sees the "invite-only" screen.

To disable a User until there is an Admin screen for it: `update coreex.users set status = 'DISABLED' where email = '...'` (`docker exec supabase_db_CoreEx psql -U postgres -c "..."` for local Supabase).

### Writing Notes

The home page lists your Items, newest first. **New Note** opens an editor where Markdown renders as you type (headings, emphasis, lists, checkboxes, code); the markup shows on the line your cursor is on. The Note saves by itself about a second after you stop typing. If it was changed somewhere else in the meantime, the editor offers to reload that version or overwrite it with yours. **Move to Trash** hides the Note; the Trash screen itself comes later.

### Folders

The sidebar shows your Folders as a tree; use the arrow to collapse one. Type a name under **Folders** to add a top-level Folder. A Folder's page lists its subfolders and Items, and lets you create a Note or subfolder there, rename it, move it (a Folder cannot go into itself or its own subfolders), or move it to the Trash. The Trash confirmation says how many Folders and Items go with it. To file a Note, use the **Folder** menu on its page; **Top level** takes it out of any Folder.

### Tags

On a Note's page, type a name under **Add a Tag**; your existing Tags are suggested as you type, and a new name creates a Tag. `Research` and `research` are the same Tag, shown with the casing it was first typed in. **×** takes a Tag off one Note. **Tags** in the sidebar lists every Tag with how many live Items use it; a Tag's page lists those Items and lets you rename it (to a name you already have is refused) or delete it from all Items at once. The Items themselves are never touched.

## Deploying

Production (from `main`) is the only cloud environment: a Vercel frontend, a Render backend and one Supabase project. `staging` is the integration branch, checked by CI and by running the stack locally. See [docs/DEPLOY.md](docs/DEPLOY.md) for setup, variables and redeploying.

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

**Hosted Supabase projects (staging, production) must have "Confirm email" turned on** (Authentication > Providers > Email). The API trusts the token's email to recognise the owner and Invites, so without confirmation someone could sign up with an invited address before its owner does. Local Supabase has it off for convenience.

No secrets are committed. Each app has an `.env.example` listing its variables. The local Supabase values in `backend/.env.example` are the fixed, public defaults of `supabase start`.
