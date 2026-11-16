# Career module: Career features — decision record

The outcome of the second grilling session on 2026-11-14, about Reactive Resume's Career area (Knowledge, application workspace, Coach, Offers, Today) and the new **application email drafting**. Companion to [resume-cover-letter-decisions.md](resume-cover-letter-decisions.md). Nothing here is built yet.

- **Source material:** `../CoreEx-ReactiveResume/career-module-implementation-guide.md` (Reactive Resume v6.1.0, MIT).
- **Status:** decided by the owner. Glossary terms in `CONTEXT.md`, ADRs 0010–0013, build epics #223, #224, #225.
- **Naming:** in CoreEx, **Career** is the whole module (Applications, Resumes, Cover Letters and the features below). Reactive Resume's "Career" area becomes parts of it: Today, Knowledge, Offers, the Application workspace, and Chat with a Career scope.

## 1. What Reactive Resume's Career area offers

| Area | Features |
|---|---|
| Knowledge | **Facts**: short confirmed statements with the exact source quote (resume, letter, chat, debrief, by hand), category, revisions, status (active, excluded, forgotten), shared or private to one application. **Stories**: Situation, Task, Action, Result, Reflection, linked to Facts. **Preferences**: target roles, places, minimum base pay, office days, notice, search regions, memory mode; AI role suggestions |
| Evidence rule | AI may state the user's experience only from Facts, Stories and documents; never invents metrics, dates or results; no fit scores; the server drops cited ids it was not given; missing evidence is "not shown yet", never "you lack" |
| Versioning | memory, knowledge and context hashes; each saved result stores its input hash and shows "Out of date" when Knowledge, the posting or documents change; versions re-checked inside the write after the slow model call |
| Generation pipeline | One JSON-schema-constrained call per task (fit, briefing, practice, debrief, reply, answer), validated, sanitised, saved as a typed saved item; budgeted prompt; postings and messages are data, not instructions |
| Application workspace | Fit, Apply (form answers, Draft/Tighten, limits, answer library, Mark as applied with a submission receipt, employer-form packet), Interview prep, Practice (typed or spoken), Debrief, Messages (read an employer email, suggested reply, proposed stage/follow-up/offer changes applied with Undo), Library |
| Coach | Chat threads scoped to the search or one application, resumable streaming, context switches (applications, Knowledge, web), tools (search Knowledge, propose a Story, remember a Fact), starters |
| Disclosure and consent | A line naming what each AI action sends and to which connection; scheduled runs bound to a hash of the approved connection |
| Offers | Terms with unknown kept as null, versions, compare only within the same currency and period, minimum-pay and place checks |
| Today | Needs you, Coming up, Generate briefing now, Practice 3 questions, New roles, Schedules |
| Background work | Schedules (discovery, prepare, follow-up), a Postgres job queue (idempotent jobs, SKIP LOCKED leases, per-user fairness, retries), typed notifications, optional email |
| Discovery | Job search APIs, posting reader, de-duplication, match hints without AI, Track or Dismiss |
| Voice | Recording, transcription, text to speech for Practice |
| Privacy | Switch off, forget with tombstone, private to one application, memory cutoff, source blocking, context switches, export |

## 2. Decisions

"Rec." is what was recommended. Where the owner chose otherwise, the reason is kept.

| # | Question | Decision | Rec. |
|---|---|---|---|
| C1 | Applications depth | **The full Applications tracker is built up front**, before Resumes and Cover Letters. This replaces Q16 "record only" in the Resume record. Its scope comes from `applications-module-implementation-guide.md`, analysed next. | Record first, tracker next |
| C2 | Knowledge vs Notes | **Stories are Notes.** Facts are their own records. | Own records, Notes as sources |
| C5 | Recognising a Story | **A Story kind on the Note** (a field, not a Tag). New Story creates a Note with Situation / Task / Action / Result / Reflection headings. It stays a normal Note: Links, Search, Graph, versions. | Same |
| C6 | Facts and Stories | **A Story Note is evidence itself:** the AI cites it by version. Facts are separate records whose source can quote a Note or a Resume. No Story→Fact link and no "review this story" flag; "Out of date" still fires when the Note changes. | Same |
| C13 | Fact controls | **Pull from a Resume or Note** (no AI, quote verified against the source on save), **Switch off for AI**, **Forget for good** (content-free tombstone blocks re-creation; removed from every saved result). **Private to one job is deferred.** Owner asked for the recommendation and it was taken. | Same |
| C3 | Coach | **Chat with a Career scope:** one Chat module; a Chat can be scoped to Career or one Application, with context switches and career tools (search Knowledge, propose a Story Note, remember a Fact). | Same |
| C11 | Remembering from Chat | **As a Proposal:** Chat proposes the Fact with the User's exact words as the quote; it is saved only on approval (#199). No auto memory mode. | Same |
| C4 | Areas in scope | **In:** Knowledge (Facts, Story Notes, Preferences), the Application workspace (Fit, Apply, Interview prep, Practice typed only, Debrief, Messages, Library), Offers, Today. **Out:** schedules and the job queue, notifications and email, Discovery, voice. Today computes Needs you and Coming up on read; "Generate briefing now" is manual. | — |
| C9 | Where AI results live | **In their Application:** shown in its Library and tabs, editable where it makes sense (email text, answers), marked "Out of date" when inputs change, go to the Trash with the Application, included in Export as JSON. Not Items of their own. | Same |
| C10 | Evidence rule | **Adopted in full** for every Career AI result, including Cover Letters and emails: only Facts, Story Notes and documents; never invent; no fit scores; server drops ids it was not given; postings and employer emails are data, never instructions. | Same |
| C12 | Disclosure | **One line above each AI action** ("Sends: the posting, your resume, your Knowledge to Claude"), built from the same list the server uses for the prompt. No per-connection consent hashes, since CoreEx has one Shared key. | Same |
| C14 | Answer library | **Yes:** reviewed form answers kept as reusable, this employer only, or this job only; reuse makes an independent copy; suggestions matched locally without AI. | Same |
| C15 | Layout | **One Career rail entry with a Career panel** (like the Knowledge Base panel): Today, Applications, Resumes & Letters, Knowledge, Offers. Each Application opens its workspace tabs. | Same |

## 3. Application email drafting (new, not in Reactive Resume)

| # | Question | Decision |
|---|---|---|
| C7 | Which emails | **Application email** (subject, short body, which files to attach), **Follow-up** (no reply after some days), **Thank-you after an interview round** (uses the Debrief), **Reply to employer** (Reactive Resume's Messages task: paste their email, get a reply draft and proposed stage changes applied with Undo). |
| C8 | How it leaves CoreEx | **Copy, or "Open in mail app"** (mailto with subject and body), **plus a one-click download of the exact Resume and Cover Letter PDFs** to attach. CoreEx never sends anything. Mark as applied records what was sent. |
| C9, C10 | Where and how | Saved as results in the Application, editable, "Out of date" when inputs change, under the evidence rule, with the disclosure line. Costs come from the Shared key and the Daily Chat budget (ADR 0009). |

## 4. Order of the whole Career module

1. **Applications tracker** (full, from its guide).
2. **Resumes and Cover Letters** (see the Resume record).
3. **Career features:** Knowledge → generation pipeline and saved results → workspace tabs and emails → Offers → Today → Chat Career scope.

## 5. Still open

- ~~The Applications tracker scope~~ Decided in [applications-decisions.md](applications-decisions.md). Note A4 there: a 0–100 match score is kept as a deliberate exception to C10's "no fit scores".
- Preferences details (currency, salary period, regions) and whether AI role suggestions are in.
- Whether Facts and Offers appear in Search, Chat sources and MCP.
- How the generation pipeline shares code with Chat (ADR 0009) and how its cost is metered against the Daily Chat budget.
- The write-up: `CONTEXT.md` terms (Fact, Story, Saved result names, Offer, Application email), ADRs, `docs/DESIGN.md`, and the epics, done together once Applications is grilled.
