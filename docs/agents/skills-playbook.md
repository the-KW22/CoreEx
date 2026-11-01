# Skills Playbook

Which skill to use, when, for every stage of the work. It is the skill layer on top of `docs/DEVELOPMENT.md`: that file says **what** must happen, this one says **which skill does it**.

Precedence: an ADR beats `DEVELOPMENT.md`, which beats this file, which beats a skill's own defaults. When a skill disagrees with this repo (file names, label names, branch rules), the repo wins.

The project's skills live in `.agents/skills/` and are pinned in `skills-lock.json`. Invoke a skill by name (`/ponytail-review`, or the Skill tool with `ponytail-review`). If your agent doesn't list it (Claude Code doesn't read `.agents/skills/`), open `.agents/skills/<name>/SKILL.md` and follow it. Skills marked **explicit** never trigger by themselves: call them by name. Skills marked **(global)** or **(Claude Code)** aren't in the project set; skip them if your agent doesn't have them.

---

## 1. Always on

These apply to every coding session, whatever the ticket.

| Skill | Rule |
|---|---|
| `ponytail` (full) | Load before writing any code: features, fixes, refactors, dependency choices. Smallest change that meets **every** acceptance criterion. Mark each deliberate shortcut `shortcut: <the limit>, <when to upgrade>`. |
| `ponytail-review` | Run on the branch before opening a PR. Fix every "Must fix". |
| `supabase-postgres-best-practices` | Load before touching anything in Postgres: a migration, a column type, an index, a query you are tuning, RLS. Even a one-column change. |

---

## 2. The life of a ticket, with skills

Follows `DEVELOPMENT.md` section 4 step by step.

### 0. Shape the idea (before an issue exists)

| Situation | Skill |
|---|---|
| A fuzzy idea or plan you want stress-tested | `grill-me` (explicit) |
| The same, and it will introduce new terms or a hard-to-reverse choice | `grill-with-docs` (explicit). It updates `CONTEXT.md` and writes ADRs in `docs/adr/` as decisions land. |
| The idea is settled in the conversation and needs writing down | `to-spec` (explicit). Publishes a spec issue labelled `ready-for-agent`. |
| A spec or plan needs splitting into work | `to-tickets` (explicit). Vertical slices, each under ~400 changed lines (`DEVELOPMENT.md` section 6), with native "blocked by" edges. Make them sub-issues of the spec. |
| New or unclear issues are piling up | `triage` (explicit). Labels per `docs/agents/triage-labels.md`; every comment starts with the AI disclaimer. |
| A choice that needs an ADR but no grilling | `engineering:architecture` (Claude Code), or write the ADR by hand from an existing one. |

### 1–2. Pick and plan

1. Pick an unblocked issue labelled `ready-for-agent`, assign yourself.
2. Read `CONTEXT.md`, the ADRs for the area, and for UI work `docs/DESIGN.md`.
3. Post the implementation plan comment. If the plan has an open design question you can't settle from the docs, stop and ask the human; don't grill them unless they ask.
4. For a ticket that touches a trust boundary (auth, uploads, signed URLs, MCP tokens, Markdown rendering, admin), note the threat in the plan's "risks". Use `security-threat-model` only if the human asks for a threat model.

### 3–4. Branch and build

Branch as `<type>/<issue>-<slug>` from an up-to-date `staging`. Then, by kind of work:

| Kind of work | Skills |
|---|---|
| Any backend feature or fix | `ponytail`. Tests first through the HTTP API (`DEVELOPMENT.md` section 9). |
| A migration, table, index, RLS, or slow query | + `supabase-postgres-best-practices`. Still follow ADR 0005 (`coreex` schema, RLS on, no policies) and Flyway rules. |
| A bug whose cause isn't obvious | `diagnosing-bugs` (global) or `engineering:debug` (Claude Code). Write the failing test first, then fix. |
| A new screen or a change to one | `ponytail` + `shadcn` (use an existing component before writing one, ADR 0006) + `impeccable` for the design pass. |
| Polishing, critiquing, or auditing an existing screen | `impeccable` in **refinement** mode: keep the identity in `docs/DESIGN.md`. App screens are its **Operate** mode (precision, not spectacle). |
| A full redesign of a screen or the brand | `impeccable` redesign mode, **only if the ticket says redesign**. Update `docs/DESIGN.md` in the same PR. |
| Animation | Motion and `<ViewTransition>`, per ADR 0006. **Not GSAP.** See section 4. |
| Frontend security (sanitising Markdown, tokens in the browser, CSP) | `security-best-practices` (TypeScript only; it does not cover Java). |
| UX copy, empty states, error messages | `impeccable` covers it; check terms against `CONTEXT.md` ("Move to Trash", not "Delete"). |

### 6. Self-review

| Check | Skill |
|---|---|
| Every PR | `ponytail-review`, fix "Must fix" items |
| PR touches auth, uploads, MCP, admin, or rendering | + Claude Code's `security-review`, or `security-best-practices` for frontend code |
| PR changes a screen | Its Playwright test and axe-matrix cell (`DEVELOPMENT.md` section 9), time-boxed; + `design:accessibility-review` if you want a second look |

### 7–9. CI, merge, verify

No skill needed. CI green, squash-merge into `staging`, run the stack locally. If CI fails, `gh-fix-ci` (global) reads the logs.

### 10. End of session

| Situation | Skill |
|---|---|
| Every session | Record and ingest it in `wiki-vault/` (`DEVELOPMENT.md` section 19). No skill: follow `wiki-vault/AGENTS.md`. |
| Work is unfinished and another agent continues it | `handoff` (explicit). It writes to the OS temp folder, not the repo. Its "suggested skills" section names skills from this file. |

---

## 3. Recurring hygiene

Things nobody does unless they are scheduled.

| When | Skill | What to do with the result |
|---|---|---|
| Before every release (`staging` → `main`) | `ponytail-debt` | Any shortcut whose "when to upgrade" has arrived becomes an issue. |
| Before every release | `engineering:deploy-checklist` (Claude Code), optional | Cross-check against `DEVELOPMENT.md` section 7 and `docs/DEPLOY.md`. |
| Every few releases, or when the code "feels slow to change" | `improve-codebase-architecture` (explicit) | Pick one candidate, grill it, file it as a `refactor` ticket. |
| Before a public launch, and after adding a new trust boundary | `security-threat-model` (explicit), `ponytail-audit` | Each "high" finding becomes a `fix` issue. |
| End of a milestone (e.g. V1 done) | `ponytail-audit` | Report only; file issues for what you'll act on. |

---

## 4. Gated or off-limits

| Skill | Status |
|---|---|
| `gsap-*` (all eight) | **Gated by ADR 0006.** Don't use them until a ticket needs timelines (the Knowledge Graph, a landing page). That ticket adds GSAP and amends the ADR; then use `gsap-react` + `gsap-timeline` (+ `gsap-scrolltrigger` for scroll work, `gsap-performance` when tuning). |
| `security-best-practices` | Python, TypeScript, Go only. Never use it on the Spring Boot backend; use `security-review` or `ponytail-review` there. |
| `setup-matt-pocock-skills` | Already done (`docs/agents/*.md`). Rerun only if the tracker or labels change. |
| `ponytail-gain`, `ponytail-help` | Information only. Never part of a workflow. |
| `impeccable` on backend work | Not applicable. |
| Any design skill not listed here (taste, brutalist, minimalist…) | Don't use on CoreEx: `docs/DESIGN.md` already defines the look. |

---

## 5. Quick lookup

| I'm about to… | Use |
|---|---|
| write or change code | `ponytail` |
| write a migration or query | `supabase-postgres-best-practices` |
| build or change a screen | `shadcn` + `impeccable` |
| fix a bug I don't understand | `diagnosing-bugs` |
| open a PR | `ponytail-review` |
| turn talk into a spec | `to-spec` |
| split a spec into tickets | `to-tickets` |
| sort the issue backlog | `triage` |
| decide something hard to reverse | `grill-with-docs` |
| hand work to another agent | `handoff` |
| cut a release | `ponytail-debt` |
| find refactors worth doing | `improve-codebase-architecture` |
| check for security holes | `security-threat-model` (repo), `security-review` (branch) |

---

## 6. Known gaps in the installed set

Fix these before relying on the skills in a fresh clone or a cloud session.

- **Claude Code doesn't load `.agents/skills/`** (checked 2026-11-01: it only listed the ponytail skills, from `~/.claude/skills/`). Codex does load it. `.agents/skills/` stays the only copy, so an agent that can't invoke a skill by name reads `.agents/skills/<name>/SKILL.md` and follows it.
- **Missing dependencies.** `grill-me`, `grill-with-docs`, `triage` and `improve-codebase-architecture` call `grilling` and `domain-modeling`, which are installed only in `~/.agents/skills/`. Same for `diagnosing-bugs`, `tdd` and `gh-fix-ci`, which this file uses. Add them to the project set so it works on any machine.
- **Glossary name.** `triage` and `improve-codebase-architecture` say `GLOSSARY.md`; ours is `CONTEXT.md` (`docs/agents/domain.md`).
- **`wayfinder`** is described in `docs/agents/issue-tracker.md` but isn't installed in the project. Install it or delete that section.
