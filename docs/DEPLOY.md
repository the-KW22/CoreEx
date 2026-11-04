# Deploying CoreEx

How the cloud environment is set up, which variables each service needs, and how to redeploy. For branches and releases see `docs/DEVELOPMENT.md` (sections 2, 3, 7, 8).

## Environments

CoreEx has **one cloud environment, production**. The Supabase free plan allows two projects and another project already uses one, so there is no cloud staging: `staging` is the integration branch, checked by CI and by running the full stack locally (README).

| | Local | Production |
|---|---|---|
| Git branch | your feature branch / `staging` | `main` |
| Frontend | `localhost:3000` | Vercel project `coreex` |
| Backend | `localhost:8080` | Render service `coreex-api-prod` |
| Database and Auth | Supabase in Docker (`supabase start`) | the one cloud Supabase project |

Pushing to `main` deploys production automatically. The backend runs Flyway on start, so every deploy migrates the database. No secret is in the repo.

Because the cloud database holds real data, a migration is first exercised on local Supabase and in the CI tests (Testcontainers), then released with the `staging` -> `main` release PR.

## Variables

**Backend (Render).** Render sets `PORT` itself.

| Variable | Value |
|---|---|
| `DB_URL` | `jdbc:postgresql://<pooler host>:5432/postgres` from Supabase **Connect > Session pooler** (see the note below) |
| `DB_USER` | `postgres.<project ref>` (from the same dialog) |
| `DB_PASSWORD` | The project's database password |
| `SUPABASE_JWKS_URI` | `https://<project ref>.supabase.co/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_ISSUER` | `https://<project ref>.supabase.co/auth/v1` |
| `OWNER_EMAIL` | The email that becomes the first Admin |
| `CORS_ALLOWED_ORIGINS` | The frontend URL, for example `https://coreex.vercel.app`, with no trailing slash |
| `STORAGE_URL` | `https://<project ref>.supabase.co/storage/v1` (needed for Assets, see "Storage for Assets") |
| `STORAGE_SERVICE_KEY` | The project's **secret** key (Project Settings > API Keys). It can do anything in Storage, and it is also used to delete a removed User's Supabase sign-in (Admin > Users > Remove), so it lives only here, never in the frontend |
| `STORAGE_BUCKET` | `assets` (the default) |
| `EMBED_URL` | `https://<project ref>.supabase.co/functions/v1/embed-8ba850b7e5aa` (needed for Semantic search, see "The embed Edge Function") |
| `EMBED_SECRET` | A long random secret, the same value as the function's secret in Supabase |

**Frontend (Vercel, under the Production environment).**

| Variable | Value |
|---|---|
| `API_URL` | The Render URL of the backend |
| `SUPABASE_URL` | `https://<project ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | The project's Publishable key (Project Settings > API Keys). Never use the secret key. |

Local development keeps its own values in `backend/.env` and `frontend/.env.local` (see the README).

## One-time setup (the owner does this)

Accounts, secrets and the first deploy are done by the owner in each dashboard.

1. **Supabase.** Use the one CoreEx project, and create it in the same region as Render (the blueprint uses Singapore). A different region makes every page slower (see "Why it can feel slow").
   - Authentication > Sign In / Providers > Email: **Confirm email must be on.** The API trusts the token's email to recognise the owner and Invites, so without confirmation someone could take an invited address first.
   - Authentication > URL Configuration: set **Site URL** to the frontend URL.
   - Note the project ref, database password, Publishable key, and the Session pooler details from **Connect**.
2. **Render.** New > Blueprint, pick this repo; it reads `render.yaml` and creates `coreex-api-prod`. Enter the backend variables above. After the first deploy, copy the service URL.
3. **Vercel.** Create one project from this repo with **Root Directory `frontend`** and Production Branch `main`. Enter the frontend variables above and redeploy. Pushes to `staging` would also build a Vercel preview that has no variables and cannot work; switch that off in Settings > Git > Ignored Build Step with `[ "$VERCEL_GIT_COMMIT_REF" != "main" ]`.
4. **Close the loop.** Put the Vercel URL into the Render service's `CORS_ALLOWED_ORIGINS` and into Supabase's Site URL, and redeploy the backend.
5. **Check it:** open the frontend URL, choose **Create account** with `OWNER_EMAIL`, confirm the email, sign in, and you should see the empty app shell. In the Render logs you should see Flyway applying the migrations.

## Storage for Assets (the owner does this once)

Assets (images and PDFs) are kept in a private Supabase Storage bucket. The backend creates upload and download links with the secret key; the browser then talks to Storage directly with those short-lived links. Until this is done, the Asset endpoints answer `503 STORAGE_UNAVAILABLE` and the rest of the app works as before.

1. **Create the bucket.** Supabase dashboard > Storage > New bucket. Name it `assets`, leave **Public bucket off**, turn on **Restrict file size** and set **5 MB**, and under **Restrict MIME types** enter `image/png, image/jpeg, image/webp, image/gif, application/pdf`. The bucket enforces these on its own, in addition to the API.
2. **Backend variables.** On the Render service add `STORAGE_URL` (`https://<project ref>.supabase.co/storage/v1`) and `STORAGE_SERVICE_KEY` (the **secret** key from Project Settings > API Keys; create one if there is none). `STORAGE_BUCKET` is already `assets`. Redeploy.
3. **Check it.** Sign in, upload a small PNG on the home page, open it, and download it. If the upload says storage is unavailable, check the two variables and the bucket name in the Render logs (the log says "Storage is not configured" or the HTTP status Storage answered).

Browsers upload straight to `https://<project ref>.supabase.co`, which allows cross-origin requests from any site by default; nothing needs changing there. Each User has a 100 MB quota by default (`coreex.assets.default-quota-bytes`), and a file is at most 5 MB.

## The embed Edge Function (the owner does this once, and again when it changes)

Semantic search (ADR 0008) turns text into vectors with Supabase's built-in `gte-small` model, inside the `embed` Edge Function in `supabase/functions/embed-8ba850b7e5aa/`. Only the API may call it: the function refuses any request that does not carry `EMBED_SECRET`. Its name has a random part (`embed-8ba850b7e5aa`) because the project ref is public: a plain `embed` URL could be guessed and called to use up the 500,000 monthly invocations, even though each call would be refused. Treat the name like a second secret: do not paste it into public places, and if the repository is ever made public, rename the folder, the `[functions.…]` entry in `supabase/config.toml` and these commands, deploy again and update `EMBED_URL`. Until this is done, embeddings are off, search stays exact-word, and the rest of the app works as before.

1. **Make a secret**, for example `openssl rand -base64 32`. It is not a Supabase key and unlocks nothing else.
2. **Set it in Supabase**: `supabase secrets set EMBED_SECRET=<the secret> --project-ref <project ref>` (or Edge Functions > Secrets in the dashboard).
3. **Deploy the function**: `supabase functions deploy embed-8ba850b7e5aa --project-ref <project ref>`. `supabase/config.toml` already sets `verify_jwt = false` for it, because the secret is its only guard and the API sends no Supabase key.
4. **Set the same secret on Render** as `EMBED_SECRET`, add `EMBED_URL` (above), and redeploy the backend.
5. **Check it.** A call without the secret must answer `401`:

   ```bash
   curl -i -X POST https://<project ref>.supabase.co/functions/v1/embed-8ba850b7e5aa -H "Content-Type: application/json" -d '{"texts":["hi"]}'
   ```

   With the header `X-Embed-Secret: <the secret>` it answers `200` and one vector of 384 numbers per text. The first call after a quiet spell loads the model and can take several seconds.

A function change reaches production only when you run step 3 again, so list it in the release checklist whenever `supabase/functions/` changed. (`shortcut: manual Edge Function deploy, move to CI when the function changes more than rarely`: a CI deploy needs a Supabase access token with power over the whole account.)

**Limits.** A call carries at most 3 texts (`MAX_BATCH` in the function, `coreex.embeddings.batch-size` in the API: keep them equal) because an Edge Function gets 2 s of CPU per request and a 220-word Chunk takes about 0.3 s. The free plan allows 500,000 calls a month. The API waits at most 3 s for one call (`coreex.embeddings.timeout`).

**Locally.** `supabase start` runs the Edge Runtime. Put `EMBED_SECRET=<any value>` in `supabase/functions/.env` (it is git-ignored), run `supabase functions serve embed-8ba850b7e5aa --env-file supabase/functions/.env`, and set `EMBED_URL=http://127.0.0.1:54321/functions/v1/embed-8ba850b7e5aa` and the same `EMBED_SECRET` in `backend/.env`. The function's own tests need no Supabase: `deno test supabase/functions/embed-8ba850b7e5aa`.

## Scheduled Trash purge (the owner does this once)

Things leave the Trash after 30 days. The backend also purges by itself every 6 hours, but only while it is awake, and the free Render plan sleeps when idle. A daily GitHub Actions run (`.github/workflows/trash-purge.yml`) calls `POST /internal/trash/purge`, which wakes the backend and purges.

1. Make up a long random token (for example `openssl rand -hex 32`).
2. On Render add `PURGE_TOKEN` with that value (the endpoint does not exist without it).
3. In the GitHub repository, Settings > Secrets and variables > Actions, add the secrets `PURGE_TOKEN` (same value) and `PURGE_URL` (`https://<backend>.onrender.com`).
4. Run the workflow once by hand (Actions > Trash purge > Run workflow) and check it is green. The answer is `{"removed":N}`.

GitHub pauses scheduled workflows after 60 days without repository activity; run it by hand to wake it up.

## Search uses the `pg_trgm` extension

The quick switcher's typo matching uses `pg_trgm`. Migration `V10` finds where the extension lives and uses it from there; if the project does not have it yet, the migration creates it in the `coreex` schema (it is a trusted contrib extension, so the `postgres` role may create it). Supabase projects often have it already, in the `extensions` schema, and that works too: the backend's connections use the search path `coreex, extensions`. Nothing needs to be done by hand. (The first v0.3.0 deploy failed on a project that already had the extension in `extensions`, before this was handled.)

## Password reset (the owner does this once)

The sign-in page has **Forgot password?**. Supabase emails a link that comes back to `<frontend URL>/auth/callback`, and Supabase only sends people to addresses on its allow-list:

1. Supabase > Authentication > URL Configuration: set **Site URL** to the frontend URL (for example `https://core-ex.vercel.app`).
2. Add `https://core-ex.vercel.app/auth/callback` (your frontend URL plus `/auth/callback`) to **Redirect URLs**.

The email is sent by Supabase, so it counts against the built-in email limit (a few per hour) until custom SMTP is set up. The link only works in the browser that asked for it.

## Things to know

- **Use the Session pooler, not the direct connection.** Supabase's direct database host is IPv6-only and Render's free tier is IPv4-only. The Session pooler (port 5432) works with Flyway and prepared statements; the Transaction pooler (port 6543) does not suit them.
- **Keep `coreex` out of Supabase's exposed schemas.** Project Settings > Data API > Exposed schemas must not list `coreex` (the default lists only `public` and `graphql_public`). The tables also have row level security on, as a second layer (ADR 0005).
- **Cold starts.** Free Render services sleep after about 15 minutes idle, and the first request afterwards takes a minute while the JVM starts. The uptime ping below keeps it awake; if the ping stops, the frontend shows "Cannot reach the CoreEx API" on a timeout; reload.

## Why it can feel slow, and what to do (measured 2026-10-30)

- **Sleeping (fixed, #85).** The free Render plan sleeps after 15 minutes without a request, and waking took **98 seconds** (Spring started in 98 s on a fraction of a CPU). An UptimeRobot monitor on the owner's account now calls `https://<backend>.onrender.com/api/health` every 5 minutes, so it never sleeps; one service running all month fits the free plan's 750 hours. A scheduled GitHub Actions run does not fit: the repository is private, so every-5-minute runs use more than the free minutes. If the monitor is ever removed, the 98 s wait comes back; Render's Starter plan never sleeps and has more CPU.
- **Region (fixed, #86).** The database was in **Sydney** while Render runs in **Singapore**, so every query crossed about 90 ms of sea. A Supabase project cannot change region, so production moved to a new project in **Singapore** (`ap-southeast-1`). The steps, and the errors met on the way (`psql` through Docker, leaving out `roles.sql` and the empty `storage.` tables), are in #86; follow them for any future move.
- **Vercel region.** `frontend/vercel.json` pins the frontend's server functions to Singapore (`sin1`), next to the API. By default they run in Washington, which put another 200 ms or more on each of the 4 to 6 API calls a page makes.
- **User check.** Every API call used to read the signed-in User from the database (three round trips). `coreex.identity.user-cache-ttl` (default 30 s) remembers the User; an Admin disabling, enabling, removing or changing a quota clears it at once. Set it to `0s` to turn it off. With more than one API instance a Disabled User could keep access for up to 30 s on the others.
- **Confirmation emails.** Supabase's built-in email sender only delivers to addresses of your own organisation's members and is rate-limited (check the current Supabase docs). Before inviting other people, set up a custom SMTP sender in Authentication > Emails.
- **Adding a staging environment later.** If a second Supabase project (or a separate schema) becomes available, add a `coreex-api-staging` service on branch `staging`, a second Vercel project, and update `docs/DEVELOPMENT.md` section 2.
- Google sign-in is not set up yet.

## Redeploying and rolling back

- **Deploy:** merge a release PR into `main`. Both hosts deploy on push.
- **Redeploy without a code change** (for example after editing variables): Render > the service > Manual Deploy > Deploy latest commit; Vercel > Deployments > Redeploy.
- **Roll back code:** Render > Events > Rollback to an earlier deploy; Vercel > Deployments > promote an earlier one. **Migrations only go forward**, so a rollback past a migration needs a new fix-forward migration (`docs/DEVELOPMENT.md`, section 10).
- **Release:** follow `docs/DEVELOPMENT.md` section 7 (release PR `staging` -> `main` with a merge commit, then tag `vX.Y.Z`).
