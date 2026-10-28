# Development Practices

How CoreEx is built, for humans and agents alike. When this file and your habits disagree, follow this file. When this file and an ADR disagree, the ADR wins; fix this file.

Read first: `CONTEXT.md` (glossary) and `docs/adr/` (decisions). Use glossary terms everywhere: in code, issues, commits, and UI copy.

---

## 1. Principles

1. **Smallest complete change.** Use `/ponytail` for all coding. Meet every acceptance criterion and build nothing beyond it.
2. **The API owns the rules.** Business rules live in the Spring Boot backend only. The frontend displays and asks (ADR 0003).
3. **Everything is scoped to the User.** Every query is filtered by the acting User, and another User's data returns 404 (ADR 0001).
4. **Tests prove behaviour, not wiring.** Test through the public HTTP API, and test risky logic once, well.
5. **Nothing reaches `main` without passing `staging`.** Production only receives code that already merged into `staging` with green CI and was checked locally. There is no cloud staging (see section 2).
6. **Write it down when it's decided.** A new term goes into `CONTEXT.md`, a hard-to-reverse choice gets an ADR, and what you learned goes into the wiki.

---

## 2. Environments

| Environment | Branch | Frontend | Backend | Supabase | Purpose |
|---|---|---|---|---|---|
| **Local** | your feature branch | `localhost:3000` | `localhost:8080` | Local Supabase (Supabase CLI in Docker) | Day-to-day development. Break things freely. |
| **Staging** | `staging` | none | none | none | The integration branch only. CI must be green, and you check the merged work by running the full stack locally. **Nothing is deployed from it** (one Supabase project, see below). |
| **Production** | `main` | Vercel | JVM host (Render) | Cloud project `coreex-prod` | Real Users. The only cloud environment. |

- The Supabase free tier allows **2 active projects**, and another project already uses one, so CoreEx has **one cloud project (production)**. Local development runs Supabase in Docker. If a second cloud project (or a separate schema) becomes available, add a staging environment and update this section and `docs/DEPLOY.md`.
- Automated tests use Testcontainers Postgres, never a cloud project.
- Each environment has its own secrets, which are never shared or committed. Every app keeps an up-to-date `.env.example` that lists every variable with a fake value.
- Free cloud Supabase projects pause after a week without traffic. If production seems dead, open it once to wake it.

---

## 3. Branching model

```
feature/fix branches ──PR (squash)──▶ staging ──release PR (merge commit)──▶ main
                                         ▲                                    │
                                         └──────── back-merge after hotfix ◀──┘
```

| Branch | Role | Who writes to it |
|---|---|---|
| `main` | What is in production. Always releasable. | Only release PRs from `staging`, and hotfix PRs. |
| `staging` | The integration branch and the **default branch**. What will be released next. | Only PRs from feature, fix, chore, and docs branches. |
| `<type>/<issue>-<slug>` | One branch per issue, short-lived (days, not weeks). | You. |

**Branch names:** `<type>/<issue-number>-<short-slug>`, using the same types as commits (section 5).

- `feat/2-walking-skeleton`
- `fix/31-backlinks-miss-trashed-items`
- `docs/40-update-glossary`
- `chore/45-bump-spring-boot`

**Rules**

- Never commit directly to `staging` or `main`. Branch protection enforces this.
- Always branch from an up-to-date `staging`: `git checkout staging`, then `git pull`, then `git checkout -b feat/2-walking-skeleton`.
- Keep a long-running branch current by merging `staging` into it (`git merge staging`). Don't rebase a branch you've already pushed and shared.
- Delete the branch after merging. GitHub does this automatically when it's configured.

---

## 4. The life of a ticket

Every piece of work has a GitHub issue. That's how both humans and agents know what's happening.

1. **Pick.** Choose an open issue with no open blockers (`Blocked by` all closed). Assign yourself. That marks it as in progress.
2. **Plan.** Before writing code, post a short **implementation plan** as a comment on the issue:
   - the approach in 3–6 bullets, in glossary terms;
   - what changes: backend modules, endpoints, migrations, frontend screens;
   - which tests prove each acceptance criterion;
   - open questions or risks.

   This is the plan a reviewer, or a future you, can check the work against.
3. **Branch** from `staging`, as in section 3.
4. **Build in small steps.**
   - Write the test that shows the behaviour, make it pass, then move on to the next criterion.
   - Commit at each green step.
   - Push at least daily, so the work is backed up and visible.
5. **Open a draft PR early** if the work spans days, so progress is visible. Mark it ready when every acceptance criterion is met.
6. **Self-review.**
   - Read your own diff on GitHub.
   - Run `/ponytail-review` and fix all "Must fix" items.
   - Tick the acceptance criteria checkboxes in the issue as you confirm each one.
7. **CI must be green.** Merge only when all checks pass.
8. **Squash-merge into `staging`.** The PR description contains `Closes #<n>`, so the issue closes itself.
9. **Verify locally.** Pull `staging`, run the full stack locally (README), and click through the feature. If it's broken, reopen the issue or file a `fix/` issue.
10. **Record the session.** At the end of every work session, record it in `wiki-vault/raw/sessions/` and ingest it (see section 19).

---

## 5. Commits

Use **Conventional Commits**:

```
<type>(<optional scope>): <imperative summary, max ~72 chars>

<optional body: why, not what — the diff shows what>

Refs #<issue>
```

| Type | Use for |
|---|---|
| `feat` | New behaviour for a User or Admin |
| `fix` | A bug fix |
| `test` | Adding or fixing tests only |
| `refactor` | A code change with no behaviour change |
| `docs` | Documentation, glossary, or ADRs |
| `chore` | Tooling, config, or dependency bumps |
| `ci` | GitHub Actions and pipeline changes |
| `build` | Build system changes (Maven, npm scripts) |

Scopes are glossary modules: `notes`, `assets`, `folders`, `tags`, `links`, `trash`, `search`, `admin`, `identity`, `frontend`, `backend`.

Examples:

- `feat(folders): prevent moving a Folder into its own subtree`
- `fix(links): treat Links to trashed Items as unresolved`
- `test(assets): cover QUOTA_EXCEEDED at upload intent`

**Rules**

- One logical change per commit. "WIP" commits are fine on your branch, because the squash merge replaces them with one clean commit on `staging`.
- The squash commit's title is the PR title, so write PR titles in commit format.
- Never commit secrets, `.env` files, build output, or IDE folders. If a secret is ever committed, **rotate it immediately**: deleting the commit is not enough.

---

## 6. Pull requests

**Feature, fix, chore, and docs PRs:** your branch into `staging`, squash merge.

The PR description:

```md
## What
One or two sentences, from the user's point of view.

## How
Key implementation choices; anything a reviewer would otherwise ask about.

## Testing
Which tests cover which acceptance criteria; anything checked by hand.

## Notes
Shortcuts taken (`shortcut:` comments), follow-ups filed as issues, screenshots for UI.

Closes #<issue>
```

**Rules**

- **Small PRs:** aim for under ~400 changed lines, excluding generated code. A ticket that needs much more was probably too big, so split it.
- One issue per PR. Unrelated fixes you notice get their own issue.
- Never merge red CI. Never merge with unresolved "Must fix" findings.
- Generated files (the OpenAPI TypeScript client) are regenerated, never edited by hand, and committed in the same PR as the API change that caused them.

**Reviewer checklist**, for humans and `/ponytail-review`:

- [ ] Does it do what the issue's acceptance criteria say, and nothing more?
- [ ] Is every query scoped to the acting User? Does another User get 404?
- [ ] Is input validated at the API boundary? Are error codes from the standard set?
- [ ] Do tests fail if the behaviour breaks?
- [ ] Does the migration (if any) work on existing data? Is it irreversible-safe?
- [ ] Are there no secrets, debug logging of personal data, or stray TODOs without an issue?
- [ ] Are glossary terms used correctly? Does it contradict an ADR?

---

## 7. Releases (`staging` → `main`)

Release when `staging` holds a set of verified work worth shipping. For V1, about once every 1–3 merged tickets is fine.

1. Pull `staging`, run the full stack locally, and check that the merged features work and nothing obvious is broken.
2. Open a PR from `staging` into `main` titled `release: vX.Y.Z`. List the included issues; GitHub's "Generate release notes" helps.
3. Merge with a **merge commit**, not a squash, so `main` and `staging` keep the same history.
4. Tag the release: create a GitHub Release `vX.Y.Z` on `main` with release notes.
5. Production deploys from `main` automatically. Smoke-test the production site: sign in, open a Note.

**Versioning:** Semantic Versioning starting at `v0.1.0`. While in `0.x`, bump the minor version for features (`v0.2.0`) and the patch version for fixes only (`v0.2.1`). `v1.0.0` is the first release of V1, when all V1 tickets are done.

---

## 8. Hotfixes

When production is broken and `staging` contains unreleased work you don't want to ship yet:

1. Branch `fix/<issue>-<slug>` from **`main`**.
2. Make the fix with a test, PR it into `main`, and use a merge commit. Tag a patch release.
3. **Back-merge:** open a PR from `main` into `staging` so the fix isn't lost on the next release.

If `staging` holds nothing unreleased, use the normal flow and release immediately.

---

## 9. Testing

| Layer | What | Tool | When it runs |
|---|---|---|---|
| **API tests (main seam)** | Every behaviour through HTTP: real Spring app, real Postgres, test JWTs for different Users and Admins | JUnit 5, Spring Boot Test, Testcontainers | Every PR (CI) and locally before pushing |
| **Unit tests** | Pure logic with many edge cases only: the Link parser, Markdown helpers | JUnit 5 | Same |
| **Storage** | Replaced by the in-memory fake behind the Storage interface | — | Same |
| **Frontend logic** | Only components with real logic (Link autocomplete, editor decorations) | Vitest + Testing Library | Every PR |
| **Smoke / E2E** | Sign in, create a Note, link it, upload an Asset, search | Playwright | Against the local stack, before each release |

**Rules**

- Name tests by behaviour: `renamingANoteKeepsItsBacklinks`, `userBGets404ForUserAsNote`.
- Every resource gets an ownership-isolation test.
- A bug fix starts with a test that fails because of the bug.
- Tests must not depend on order, the network, or the wall clock. Inject a `Clock` for time-based rules such as Trash purge and pending-upload cleanup.
- No sleeps or flaky retries. A flaky test is a bug, so fix it or delete it.

---

## 10. Backend conventions (Spring Boot)

**Structure: package by feature, not by layer.**

- Use `identity`, `notes`, `assets`, `folders`, `tags`, `links`, `trash`, `search`, `storage`, `admin`, and a small `common` (error handling, User scoping). Don't use top-level `controllers/`, `services/`, `repositories/`.
- Inside a feature: a controller (thin: parse, validate, call the service, map to DTO), a service (owns rules and transactions), repositories, entities, and DTOs.
- One feature calls another only through its service, never through its repository.

**Rules**

- **DTOs at the edge.** Never return JPA entities from controllers. Request DTOs carry Bean Validation (`@NotBlank`, `@Size`, …) and are validated with `@Valid`.
- **One error format.** A single `@RestControllerAdvice` maps exceptions to `{ "code": "QUOTA_EXCEEDED", "message": "…" }` with the right HTTP status. Codes come from the spec's list, and new codes are added there.
- **Transactions** belong on service methods that write. Keep them short, and never call Storage inside an open transaction when you can avoid it.
- **User scoping:** services receive the acting User from the security context. Repository methods include the owner id (`findByIdAndOwnerId`). There is no unscoped "find by id" for User content.
- **Configuration** goes through typed `@ConfigurationProperties` (limits, quotas, retention), never magic numbers.
- **Logging:** structured, at INFO for meaningful events and DEBUG for detail. Never log Note content, Asset URLs, tokens, or emails at INFO.
- **Scheduled jobs** (Trash purge, pending-upload cleanup) are idempotent and safe to run twice.

**Database and migrations (Flyway)**

- Every schema change is a new migration, `V<n>__<description>.sql`. **Never edit a migration that has run anywhere**; fix forward with a new one.
- Migrations must work on existing data. To add a NOT NULL column, add it nullable, backfill it, then constrain it.
- Index foreign keys and every column you filter by, and always include the owner id.
- Use `uuid` primary keys and `timestamptz` for all timestamps, stored in UTC.
- **All tables live in the `coreex` schema, never `public`** (ADR 0005). Migrations write unqualified names; the connection's `search_path` puts them in `coreex`.
- **Every new table enables row level security** in the same migration (`alter table <name> enable row level security;`, no policies). `SchemaApiTest` fails if one is missed.

---

## 11. Frontend conventions (Next.js)

- The frontend calls the API **only** through the generated OpenAPI client. No `fetch` to hand-typed URLs, and no direct Supabase database calls. Supabase JS is used for sign-in only.
- Use shadcn/ui components before writing custom ones. Follow existing patterns in the codebase.
- Every screen handles all four states: loading, empty, error (show the API's message), and success.
- **Accessibility:** every interactive element is reachable by keyboard and has a label; dialogs trap focus; colour is never the only signal.
- UI copy uses glossary terms: "Move to Trash", not "Delete", for soft deletes.
- No secrets in the frontend. Only variables prefixed `NEXT_PUBLIC_` reach the browser; treat them as public.

---

## 12. API design

- REST resources are plural nouns under `/api`: `/api/notes/{id}`, `/api/folders/{id}/move`. Actions that aren't simple CRUD are sub-resources named as verbs only when unavoidable (`/restore`, `/confirm`).
- **Status codes:** `200` read or update, `201` create (with the body), `204` delete, `400` validation, `401` no or invalid token, `403` not allowed (admin, disabled, not invited), `404` missing **or not yours**, `409` version or state conflict, `413` too large, `415` unsupported type.
- Use JSON with camelCase fields and ISO-8601 UTC timestamps.
- Lists are paginated from the start (`?page=&size=`, returning `items` and `total`).
- The OpenAPI spec is the contract. Changing a response shape is a breaking change for the frontend and, from V1.5, for MCP clients. Prefer additive changes.

---

## 13. Security

- **Secrets** live only in environment variables and the hosting dashboards. The Supabase service-role key and S3 credentials exist **only** in the backend.
- **Validate at every trust boundary:** request bodies, file type and size (check the stored object, not the client's claim), and Markdown rendering. Sanitise rendered HTML and never allow raw `<script>`.
- **CORS** allows only the known frontend origin per environment.
- **Signed URLs** are short-lived (minutes) and issued only after an ownership check.
- **Dependencies:** enable Dependabot alerts and security updates on GitHub. Review and merge its PRs like any other change.
- The Admin role is checked server-side (`ROLE_ADMIN`), and Admins never get content (ADR 0004).

---

## 14. Dependencies

- Before adding one: is it already in the codebase, the standard library, Spring, or the platform? Never add a dependency for a few lines (ponytail rule).
- Every new dependency is mentioned in the PR's "How" section with the reason.
- Commit lockfiles (`package-lock.json`). Use explicit versions in Maven, managed by the Spring Boot parent.

---

## 15. Continuous integration

GitHub Actions run on every PR into `staging` and `main`:

1. Backend: build and all tests (Testcontainers runs in Actions).
2. Frontend: install, typecheck, lint, tests, build.
3. Check that the generated API client matches the current OpenAPI spec.

Branch protection requires these checks to pass before merging. Production deploys from the hosting providers on push to `main`; nothing deploys from `staging`.

---

## 16. Documentation

| What | Where | When |
|---|---|---|
| Domain terms | `CONTEXT.md` | A new or changed term appears |
| Hard-to-reverse decisions | `docs/adr/NNNN-*.md` | Before or with the PR that implements it |
| How to run, test, deploy | `README.md`, `docs/` | When setup steps change |
| Plans and progress | GitHub issues (plan comment, checkboxes), PRs | Every ticket |
| What you learned, session history | `wiki-vault/` (local only, gitignored) | End of every work session |

---

## 17. Tracking progress

| Question | Where to look |
|---|---|
| How far is V1? | Issue **#1**: its sub-issue progress bar (x of 13 done) |
| What can I start now? | Open issues with no open blockers. GitHub shows a "Blocked by" badge on the others. |
| What is in progress? | Issues with an assignee, or the **In progress** column on the GitHub Project board |
| How was a ticket implemented? | The plan comment on the issue, then its merged PR |
| What is on staging but not in production? | GitHub's compare view, `main...staging` |
| What shortcuts are we carrying? | `/ponytail-debt` |
| What did I learn or decide along the way? | `wiki-vault/wiki/log.md`, `wiki-vault/raw/sessions/`, and the wiki pages |

---

## 18. Definition of Done

A ticket is done when **all** of these are true:

- [ ] Every acceptance criterion is met and ticked in the issue.
- [ ] Tests prove each criterion, including an ownership-isolation test for new resources.
- [ ] CI is green, and `/ponytail-review` has no open "Must fix" findings.
- [ ] Migrations, `.env.example`, the README, and the OpenAPI client are updated where affected.
- [ ] Glossary terms and ADRs are respected or updated.
- [ ] It is merged into `staging`, and it works when run locally from `staging`.
- [ ] The session is recorded in `wiki-vault/raw/sessions/` and ingested.

---

## 19. Session records (wiki vault)

`wiki-vault/` is a local-only LLM Wiki (Karpathy's pattern) inside this repo. It is gitignored, so it is never pushed. Its own `wiki-vault/AGENTS.md` is the full schema.

**At the end of every work session**, whether coding, debugging, planning, or studying, an agent must:

1. **Record:** write one new file, `wiki-vault/raw/sessions/YYYY-MM-DD-HHMM-<slug>.md`, using the session template in `wiki-vault/AGENTS.md`. Once written, it is never edited.
2. **Ingest:** run the vault's ingest operation on that file. That means a source summary, updated concept and entity pages, `index.md`, and a `log.md` entry.

If `wiki-vault/` doesn't exist (for example, in a fresh clone or a cloud session), say so at the end of the session and put the record in the final message, so the human can add it.
