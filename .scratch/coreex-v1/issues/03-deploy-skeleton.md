Status: ready-for-agent
Blocked by: 02

# 03 — Deploy the skeleton to production

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

The signed-in skeleton runs in production: the frontend on Vercel, the backend on a JVM host (Render, Railway, or Fly.io), and a separate Supabase prod project. The owner can sign in at the public URL and see the empty app shell. Deploying early means every later ticket ships to a real environment, and hosting surprises (JVM memory, cold starts, CORS, env vars) surface now, not at the end.

## Acceptance criteria

- [ ] Frontend and backend are deployed with production env vars; no secrets in the repo
- [ ] Supabase prod is separate from dev, and Flyway migrations run on backend deploy
- [ ] CORS allows only the production frontend origin (plus localhost in dev)
- [ ] The owner can sign in at the public URL and reach the app shell
- [ ] A short deploy guide in docs explains how to redeploy each app

## Blocked by

`02`
