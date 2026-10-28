# CoreEx

CoreEx is a personal knowledge base, built as a learning project that may later become a public SaaS. Users write Markdown Notes, upload Assets (images and PDFs), organize Items with Folders and Tags, and connect them with Links.

- **Glossary:** `CONTEXT.md`. Use its terms and avoid the synonyms it lists.
- **Decisions:** `docs/adr/`. Don't contradict an ADR silently.
- **V1 spec and tickets:** `.scratch/coreex-v1/`.

## Repo layout

- `frontend/`: Next.js (TypeScript) UI only. Never talks to the database directly.
- `backend/`: Spring Boot REST API. Owns every business rule and is the only thing that touches Postgres.
- `docs/`: ADRs and agent configuration.

## Rules that are easy to break

- Every read and write is scoped to the authenticated User (ADR 0001).
- Note content is stored as Markdown (ADR 0002).
- The frontend calls only the REST API, through the client generated from the OpenAPI spec (ADR 0003).
- Admin endpoints never return another User's content (ADR 0004).

## Agent skills

### Issue tracker

Issues and specs are local Markdown files under `.scratch/<feature>/`. There is no remote yet; this moves to GitHub Issues once the repo exists. See `docs/agents/issue-tracker.md`.

### Triage labels

The default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
