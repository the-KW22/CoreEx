# Career module: Applications tracker — decision record

The outcome of the Applications grilling on 2026-11-14. Companion to [resume-cover-letter-decisions.md](resume-cover-letter-decisions.md) and [career-features-decisions.md](career-features-decisions.md). Nothing here is built yet.

- **Source material:** `../CoreEx-ReactiveResume/applications-module-implementation-guide.md` (Reactive Resume v6.1.0, MIT).
- **Status:** decided by the owner. Glossary terms in `CONTEXT.md`, ADRs 0010–0013, build epics #223, #224, #225.
- **Place in the order:** the tracker is the **first** part of Career (C1), before Resumes and Cover Letters.

## 1. What Reactive Resume's Applications module offers

| Area | Features |
|---|---|
| Stages and lanes | Six fixed categories (saved, applied, screening, interview, offer, closed) drive all logic; user lanes on top (label, colour, order, retire with move, preset close reason), max 40; pipeline revision for concurrency |
| Transition engine | One function for every writer (create, update, bulk, CSV, Career, MCP); category change = milestone; stage timeline entries with a server `writeSequence` |
| Timeline | JSON array of stage, note and interview entries; day dates stored at 12:00 UTC; back-dating guarded; `dateUnknown` for imports |
| Next step | Pure `getNextStep(app, now, tz)`: closed, offer, interview, follow-up, not applied, no reply after 10 days, interview feedback, waiting; "Needs you"; sort key; Coming up |
| Views | List grouped by stage with bulk actions; Board with drag and deferred-write Undo; Calendar of interviews; Insights (funnel, reply rate, median reply time, tailored vs base, PNG export); state in the URL |
| Adding | Read a link (SSRF-safe fetch, JSON-LD JobPosting), paste text, AI parse, keyword search; typed fields protected; idempotent create; "add and tailor a resume" |
| Duplicates | Canonical URL (drops tracking and secret parameters) to refuse a tracked posting; "applied here before, no reply" notice |
| Details sheet | Stage stepper, Next step card, What you sent, key facts edited in place, posting, contacts, notes, activity, open workspace |
| What you sent | Link a live resume/letter or upload a PDF; first move to a sent stage freezes "sent" versions and the Check score; a sent document cannot be swapped |
| Interviews | Type, time in a named timezone, duration, location, participants, audience, notes; .ics export with a stable UID and cancellation |
| Follow-ups | One reminder per application, date-only = 09:00 local; "I followed up", "They replied" reset the no-reply clock |
| Other | Contacts (JSON array), notes, tags, source; Close with a reason; Trash with timelines intact; CSV import and export with aliases and an injection guard |
| AI | Parse posting, search postings, autofill, match score 0–100, draft message, tailor resume (proposals), prepare, evidence proposal |

## 2. Decisions

| # | Question | Decision | Rec. |
|---|---|---|---|
| C1 | Depth and order | **Full tracker, built first** (replaces Q16 "record only"). | Record first, tracker next |
| Q17 | Item | **A full Item:** Folders, Tags, Trash, Search, Link target, Graph, Export, MCP. | Tags + Trash only |
| A7 | Item title | **"Role at Company", set automatically until the User renames it.** | Same |
| A1 | Documents | **The tracker ships without Resume/Letter links** (an uploaded PDF is allowed). Linking, "What you sent", sent snapshots and "Copy a resume for a job" are tickets in the Resume epic. | Same |
| A3 | Stages | **The six fixed stages first, with close reasons** (accepted, not selected, withdrew, accepted another, no response). The data keeps a lane id so custom lanes can come later without changing meaning. | Same |
| — | Transition engine, timeline, Next step | **In, as in Reactive Resume** (needed by every view, Today and the workspace). Follows the guide by default. | — |
| A2 | Views | **List, Board, Calendar, Insights.** | — |
| A4 | Fit vs score | **Keep both the Career Fit check and a 0–100 match score.** This is a **deliberate exception** to the evidence rule's "no fit scores" (C10); the ADR or spec must say so. | Drop the score, use Fit |
| A5 | Adding a job | **Paste posting text, read a link** (backend fetch: public hosts only, limited redirects, size cap, JSON-LD JobPosting first), **AI fills the fields** when the structure is missing (Shared key, Daily Chat budget). **No keyword search** (needs a paid search API). | — |
| A6 | Extras | **In:** duplicate posting refusal (canonical URL) and the "applied here before, no reply" notice; **one follow-up reminder** per Application, shown in Next step and Today only. **Out:** CSV import/export, contacts. | — |
| A8 | Interviews | **Basic:** date, time, type and notes. No timezone per interview, duration, participants, audience or .ics export. The Calendar view shows them. | Full |

## 3. Consequences and follow-ups

- **Reminders and Today have no notifications.** Schedules are out (C4), so a due follow-up is only visible when the User opens Career.
- **Basic interviews limit Interview prep and Next step:** with no duration, "interview has ended" needs a default length (assume one hour), and briefings get no audience or participants.
- **No contacts** means the Application email (C7) has no stored recipient; the User types the address or the mail app fills it.
- **Reading a link is the first server-side fetch of arbitrary URLs in CoreEx;** it needs SSRF protection and a test suite of blocked hosts.

## 4. Still open

- Bulk actions in the List (move, tag, close, trash many): in by default with List unless the owner says otherwise.
- Insights details: which tiles, and whether "tailored vs base resume" waits for the Resume epic.
- Where Offers' "respond by" date sits in Next step before Offers are built.
