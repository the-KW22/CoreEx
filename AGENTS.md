# CoreEx

CoreEx is a personal knowledge base, built as a learning project that may later become a public SaaS. Users write Markdown Notes, upload Assets (images and PDFs), organize Items with Folders and Tags, and connect them with Links.

- **Glossary:** `CONTEXT.md`. Use its terms and avoid the synonyms it lists.
- **Decisions:** `docs/adr/`. Don't contradict an ADR silently.
- **UI design:** `docs/DESIGN.md` (tokens, layout, screens). Frontend work follows it.
- **V1 spec and tickets:** GitHub issue #1 and its sub-issues (#2–#14).

## Repo layout

- `frontend/`: Next.js (TypeScript) UI only. Never talks to the database directly.
- `backend/`: Spring Boot REST API. Owns every business rule and is the only thing that touches Postgres.
- `docs/`: ADRs, `DEVELOPMENT.md` (how we work), and agent configuration.
- `wiki-vault/`: a local-only LLM Wiki of session records and learnings. It is gitignored and never pushed. Its schema is `wiki-vault/AGENTS.md`.

## Rules that are easy to break

- Every read and write is scoped to the authenticated User (ADR 0001).
- Note content is stored as Markdown (ADR 0002).
- The frontend calls only the REST API, through the client generated from the OpenAPI spec (ADR 0003).
- Admin endpoints never return another User's content (ADR 0004).
- Tables live in the `coreex` schema, never `public`, and every table enables row level security (ADR 0005).

## How to code here

- **Use the `/ponytail` skill (full level) for all coding work**: features, fixes, refactors, and choosing dependencies. Build the smallest change that fully meets the ticket. Every acceptance criterion counts as "asked for", so never cut one to save code.
- Mark every deliberate shortcut with a comment in the form `shortcut: <the limit>, <when to upgrade>`, so that `/ponytail-debt` can list them later.
- Before opening a pull request, run `/ponytail-review` on the branch and fix the "Must fix" items.

## Workflow per ticket

**Work epics in bundles** (3–5 related sub-issues, one branch, one PR, one session). The rules for raising issues and for working a bundle are in `docs/agents/skills-playbook.md`, section "Bundles". Read it before you raise or pick up an issue.

**`docs/DEVELOPMENT.md` is the full guide.** It covers branching, commits, PRs, releases, testing, conventions, and the Definition of Done. Read it before your first change. In short:

1. Pick an open issue with no open blockers, assign yourself, and post an implementation plan as an issue comment.
2. Branch from an up-to-date `staging` as `<type>/<issue>-<slug>`, for example `feat/2-walking-skeleton`.
3. Build test-first in small Conventional Commits.
4. Open a PR **into `staging`** with `Closes #<issue>`, run `/ponytail-review`, get CI green, then squash-merge.
5. Never commit to `staging` or `main` directly. `main` only receives release PRs from `staging`.

## End of every session (mandatory)

Before you finish **any** work session in this repo, record it and ingest it into the wiki vault (`docs/DEVELOPMENT.md` section 19):

1. Write `wiki-vault/raw/sessions/YYYY-MM-DD-HHMM-<slug>.md` using the session template in `wiki-vault/AGENTS.md`.
2. Ingest it, following `wiki-vault/AGENTS.md`: the source summary, the concept and entity pages, `index.md`, and `log.md`.

Never `git add` anything under `wiki-vault/`.

## Agent skills

**Which skill to use at each stage of a ticket is in `docs/agents/skills-playbook.md`.** Read it before your first change, alongside `docs/DEVELOPMENT.md`.

### Issue tracker

GitHub Issues on `the-KW22/CoreEx`, using native sub-issues and "blocked by" dependencies. External PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

The default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
