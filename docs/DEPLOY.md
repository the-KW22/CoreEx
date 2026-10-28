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

**Frontend (Vercel, under the Production environment).**

| Variable | Value |
|---|---|
| `API_URL` | The Render URL of the backend |
| `SUPABASE_URL` | `https://<project ref>.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | The project's Publishable key (Project Settings > API Keys). Never use the secret key. |

Local development keeps its own values in `backend/.env` and `frontend/.env.local` (see the README).

## One-time setup (the owner does this)

Accounts, secrets and the first deploy are done by the owner in each dashboard.

1. **Supabase.** Use the one CoreEx project, in the same region as Render (the blueprint uses Singapore).
   - Authentication > Sign In / Providers > Email: **Confirm email must be on.** The API trusts the token's email to recognise the owner and Invites, so without confirmation someone could take an invited address first.
   - Authentication > URL Configuration: set **Site URL** to the frontend URL.
   - Note the project ref, database password, Publishable key, and the Session pooler details from **Connect**.
2. **Render.** New > Blueprint, pick this repo; it reads `render.yaml` and creates `coreex-api-prod`. Enter the backend variables above. After the first deploy, copy the service URL.
3. **Vercel.** Create one project from this repo with **Root Directory `frontend`** and Production Branch `main`. Enter the frontend variables above and redeploy. Pushes to `staging` would also build a Vercel preview that has no variables and cannot work; switch that off in Settings > Git > Ignored Build Step with `[ "$VERCEL_GIT_COMMIT_REF" != "main" ]`.
4. **Close the loop.** Put the Vercel URL into the Render service's `CORS_ALLOWED_ORIGINS` and into Supabase's Site URL, and redeploy the backend.
5. **Check it:** open the frontend URL, choose **Create account** with `OWNER_EMAIL`, confirm the email, sign in, and you should see the empty app shell. In the Render logs you should see Flyway applying the migrations.

## Things to know

- **Use the Session pooler, not the direct connection.** Supabase's direct database host is IPv6-only and Render's free tier is IPv4-only. The Session pooler (port 5432) works with Flyway and prepared statements; the Transaction pooler (port 6543) does not suit them.
- **Cold starts.** Free Render services sleep after about 15 minutes idle, and the first request afterwards takes a minute while the JVM starts. The frontend shows "Cannot reach the CoreEx API" if it times out; reload.
- **Confirmation emails.** Supabase's built-in email sender only delivers to addresses of your own organisation's members and is rate-limited (check the current Supabase docs). Before inviting other people, set up a custom SMTP sender in Authentication > Emails.
- **Adding a staging environment later.** If a second Supabase project (or a separate schema) becomes available, add a `coreex-api-staging` service on branch `staging`, a second Vercel project, and update `docs/DEVELOPMENT.md` section 2.
- Google sign-in is not set up yet.

## Redeploying and rolling back

- **Deploy:** merge a release PR into `main`. Both hosts deploy on push.
- **Redeploy without a code change** (for example after editing variables): Render > the service > Manual Deploy > Deploy latest commit; Vercel > Deployments > Redeploy.
- **Roll back code:** Render > Events > Rollback to an earlier deploy; Vercel > Deployments > promote an earlier one. **Migrations only go forward**, so a rollback past a migration needs a new fix-forward migration (`docs/DEVELOPMENT.md`, section 10).
- **Release:** follow `docs/DEVELOPMENT.md` section 7 (release PR `staging` -> `main` with a merge commit, then tag `vX.Y.Z`).
