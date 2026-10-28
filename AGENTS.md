# CoreEx

CoreEx is a personal knowledge base, built as a learning project that may later become a public SaaS. Users write Markdown Notes, upload Assets (images and PDFs), organize Items with Folders and Tags, and connect them with Links.

- **Glossary:** `CONTEXT.md`. Use its terms and avoid the synonyms it lists.
- **Decisions:** `docs/adr/`. Don't contradict an ADR silently.
- **V1 spec and tickets:** GitHub issue #1 and its sub-issues (#2–#14).

## Repo layout

- `frontend/`: Next.js (TypeScript) UI only. Never talks to the database directly.
- `backend/`: Spring Boot REST API. Owns every business rule and is the only thing that touches Postgres.
- `docs/`: ADRs, `DEVELOPMENT.md` (how we work), and agent configuration.

## Rules that are easy to break

- Every read and write is scoped to the authenticated User (ADR 0001).
- Note content is stored as Markdown (ADR 0002).
- The frontend calls only the REST API, through the client generated from the OpenAPI spec (ADR 0003).
- Admin endpoints never return another User's content (ADR 0004).

## How to code here

- **Use the `/ponytail` skill (full level) for all coding work**: features, fixes, refactors, and choosing dependencies. Build the smallest change that fully meets the ticket. Every acceptance criterion counts as "asked for", so never cut one to save code.
- Mark every deliberate shortcut with a comment in the form `shortcut: <the limit>, <when to upgrade>`, so that `/ponytail-debt` can list them later.
- Before opening a pull request, run `/ponytail-review` on the branch and fix the "Must fix" items.

## Workflow per ticket

**`docs/DEVELOPMENT.md` is the full guide.** It covers branching, commits, PRs, releases, testing, conventions, and the Definition of Done. Read it before your first change. In short:

1. Pick an open issue with no open blockers, assign yourself, and post an implementation plan as an issue comment.
2. Branch from an up-to-date `staging` as `<type>/<issue>-<slug>`, for example `feat/2-walking-skeleton`.
3. Build test-first in small Conventional Commits.
4. Open a PR **into `staging`** with `Closes #<issue>`, run `/ponytail-review`, get CI green, then squash-merge.
5. Never commit to `staging` or `main` directly. `main` only receives release PRs from `staging`.

## Agent skills

### Issue tracker

GitHub Issues on `the-KW22/CoreEx`, using native sub-issues and "blocked by" dependencies. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
