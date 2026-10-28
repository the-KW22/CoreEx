Status: ready-for-agent
Blocked by: None — can start immediately

# 01 — Walking skeleton: frontend calls backend through the generated client

Spec: `.scratch/coreex-v1/PRD.md`

## What to build

A minimal, runnable CoreEx monorepo. The Spring Boot backend exposes one public health endpoint and publishes an OpenAPI spec. The Next.js frontend shows a page that calls that endpoint through a TypeScript client **generated from the spec** and displays the result. The backend connects to Supabase Postgres (dev project) and runs an empty Flyway baseline migration on start. The API test harness (Spring app + Testcontainers Postgres) exists, with one passing test against the health endpoint. Running both apps locally is documented in the README.

## Acceptance criteria

- [ ] The backend starts locally, runs Flyway against Postgres, and serves the health endpoint and the OpenAPI spec
- [ ] The frontend's API client is generated from the OpenAPI spec by one documented command; no hand-written API calls
- [ ] The frontend page renders the health response from the backend
- [ ] One API test runs against Testcontainers Postgres and passes with a single command
- [ ] No secrets are committed; configuration comes from environment variables, with an example env file per app
- [ ] The README explains how to run both apps and the tests locally

## Blocked by

None — can start immediately.
