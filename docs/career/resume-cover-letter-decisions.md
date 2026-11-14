# Career module: Resumes and Cover Letters — decision record

The outcome of the grilling session on 2026-11-14. It records what was decided for the Resume and Cover Letter part of the new **Career** module, the reasons, and what is still open. It is the input for the CONTEXT.md terms, the new ADRs and the epic with sub-issues. Nothing here is built yet.

- **Source material:** `../CoreEx-ReactiveResume/reactive-resume-feature-inventory.md` and `documents-module-implementation-guide.md` (Reactive Resume v6.1.0, MIT).
- **Status:** decided by the owner. Glossary terms in `CONTEXT.md`, ADRs 0010–0013, build epics #223, #224, #225.
- **Not yet grilled:** the email drafting feature (section 7) and the wider Career features (Knowledge, Coach, workspace, Offers, Today), which have their own session.

## 1. What Reactive Resume's Documents module offers

Everything below was in scope for the discussion. Section 3 says what CoreEx takes.

| Area | Features |
|---|---|
| Library | One list of resumes and letters; grid or list view with live thumbnails; search and sort; tags; New dialog (blank, sample, import, letter); rename, duplicate, lock; Trash; grouped by job; copy a resume for a job |
| Data model | A resume is one validated JSON blob (basics, photo, summary, 12 built-in sections, custom sections, metadata: layout, page, design, typography, private notes, check choices). Sharing, lock, trash, tags are columns. Structured dates |
| Editor shell | Write, Design, Check, Share modes; live real-size PDF canvas with zoom; click on the page to select; autosave with Saving/Saved/Not saved and Retry; conflict "keep a copy and reload"; local recovery; undo/redo (200 steps, coalesced per field); undo toast; lock; private notes; phone layout |
| Write mode | Basics and custom contact fields, photo with crop, rich-text summary, per-section entry forms, add/hide/rename/reorder/remove sections, custom sections, entries (add, duplicate, hide, move, delete), roles at one company, structured dates and date format, links, keywords, levels, Improve with AI, resume language |
| Rendering | Templates as React components; one renderer for preview, PDF and HTML; page map for click-to-select, issue pins, overflow and fit; font subsetting and fallbacks |
| Design mode | Template gallery drawn with your own content and filters; preview and apply; reset; entry header layouts and accents; font pairings and any font; text size and density; accent colour with contrast check; A4/Letter/free-form; margins; sidebar side and width; sections across columns and pages; entries in columns; fit to page or add a page; custom Semantic CSS with element picker |
| Check mode | Data linter (contact, dates, layout, headings, writing rules) with score, ignore list, quick fixes, issues pinned on the page; parser view; job match (stemmed keywords, aliases, "not true for me"); check of the exported PDF; AI writing review as proposals |
| Version history | Session autosave versions, named versions, a version per AI edit, before/after restore snapshots, preview and restore |
| Sharing | Public page, custom address with redirects, visibility, password, visitor downloads, short link and domain, statistics, social preview, feedback links with comments |
| Import | Reactive Resume JSON (v4–v6), JSON Resume, LinkedIn zip, PDF without AI, PDF and DOCX with AI, review before creating |
| Export | PDF (worker), DOCX, ODT, Markdown, JSON, print |
| Cover letters | Own table and editor (Write, Design); recipient, date, greeting, sign-off; sender and design linked to a resume or copied; rendered as a one-section resume with the same templates; length guide 180–320 words; AI draft with Shorter / More personal, versions, accept or reject; letter language; export and history |

## 2. Decisions

"Rec." is what was recommended in the session. Where the owner chose otherwise, the reason for the recommendation is kept so the trade-off stays visible.

### 2.1 Where it lives

| # | Question | Decision | Rec. |
|---|---|---|---|
| Q8 | Module name | **Career.** It will later also hold job application tracking, job analysis and company analysis. | Resumes |
| Q1, Q7 | Domain fit | **Resume, Cover Letter (and the job Application) are new Item types**, independent of Notes, like Assets: each has its own page in Career, and can also sit in a Folder (linking back to its page), take Tags and Tag colours, go to the Trash, be a Link target, show in the Graph, Search, Semantic search and Chat, and be in Export and the MCP tools. | Own module, not Items |
| Q10 | Links | **Link target only.** Only Notes contain `[[...]]` Links. A resume is printed for strangers, so Links inside it would need stripping. | Same |
| Q6 | Sharing | **No sharing.** No public resume pages, feedback links or view statistics. ADR 0001 stays as it is. | Allow with a new ADR |

### 2.2 Data and rendering

| # | Question | Decision | Rec. |
|---|---|---|---|
| Q2, Q5 | Storage of rich text | **One JSON blob per Resume / Cover Letter, rich text stored as HTML, edited with Tiptap. Needs a new ADR**, since ADR 0002 makes Notes Markdown. | Markdown subset |
| — | Consequences of HTML (agreed by default) | The backend sanitises every HTML field against an allowlist on every write (editor, import, Agents). The backend derives plain text (jsoup) on save for Search, Chunks and Chat. Agents read a Markdown view and write HTML through JSON Patch. | — |
| Q27 | Schema source of truth | **Java records in the backend → OpenAPI (springdoc) → generated TypeScript types** (ADR 0003). JSON Patch results are validated by deserialising into the records. | Same |
| Q3 | PDF and preview | **react-pdf in the browser, in a Web Worker.** Preview equals download. | Same |
| Q12 | PDFs for Export | **A Next.js route handler runs the same react-pdf templates;** the backend calls it while building the zip. | Same |
| Q11 | Agent edits | **JSON Patch with the expected save counter; each Agent edit keeps a version.** | Same |
| Q22 | Version history | **Note version rules** (Agent edits and Restore always keep one, newest 50, 90 days) **plus named versions that never expire.** | Same |

**Why Markdown was recommended (kept for the ADR):** Reactive Resume chose HTML because its Tiptap editor came first, it formats beyond Markdown (colour, highlight, underline, alignment, RTL), it served a public HTML page, and older versions already stored HTML. The cost shows in its code: sanitize-html, an HTML parser per output, html-to-docx, and a separate Markdown builder for AI. With Search, Chat, Export and MCP all chosen, HTML means one more converter on those paths. The middle path not taken: Tiptap editing with Markdown storage (`@tiptap/markdown`).

### 2.3 Scope

| # | Question | Decision | Rec. |
|---|---|---|---|
| Q4 | First release | **Broad parity with Reactive Resume** (minus sharing). | Core loop |
| Q26 | Rollout | **Ship slices as they land**, through staging to production as usual. Career appears once the library, editor, one template and PDF work. | Same |
| Q15 | Applications | **A minimal job Application is built first**, before cover letters. | Resume link only |
| Q16 | Application in this step | ~~Record only~~ **Superseded by C1** in [career-features-decisions.md](career-features-decisions.md): the full Applications tracker is built first. | Record + stages |
| Q17 | Application as an Item | **Full Item** (Folders, Tags, Trash, Search, Links, Graph, Export, MCP). | Tags + Trash only |
| Q28 | Job copies | **"Copy a resume for a job"** (one step, idempotent, linked to an Application) **and grouping documents by job** in Career. | Same |
| Q29 | Letter sender and design | **Linked live to a Resume, with a switch to unlink into an editable copy.** If the Resume is deleted, the copy stays. | Same |
| Q23 | Editor | **Every Reactive Resume editor feature:** autosave and status, conflict "(mine)" copy, local recovery, undo/redo with coalescing and undo toast, click-to-select, zoom, lock, private notes, phone layout. | — |
| Q14 | Templates | **3:** one single-column ATS-safe, one two-column with sidebar, one modern with accent header. | Same |
| Q21 | Design | **All of it:** template, fonts, colours, margins, density, layout and pages, fit to page, photo, custom (semantic) CSS. | — |
| Q24 | Photo | **Stored as an Asset** (appears in Assets, reusable across resumes). | Hidden file |
| Q18 | Check mode | **Everything Reactive Resume has:** linter, score, ignore, quick fixes, pinned issues, job match, parser view, exported-PDF check, AI writing review. | — |
| Q13 | AI features | **Cover letter draft, improve a line, AI import (PDF/DOCX), AI writing review.** All on the Shared key and the Daily Chat budget (ADR 0009). | — |
| Q19 | Non-AI import | **CoreEx JSON** (Export round trip), **Reactive Resume JSON, JSON Resume, LinkedIn zip.** No rule-based PDF parser; AI import covers PDF and Word. | Same |
| Q20 | Downloads | **PDF + Print, DOCX, Markdown, JSON.** No ODT. | — |
| Q9 | Export zip | **JSON + Markdown + PDF** for each Resume and Cover Letter. | JSON + Markdown |
| Q25 | Language | **English only** for printed words; store a locale field so more languages need no data change. | Same |

## 3. Risks named in the session

1. **Size.** Broad parity is many weeks of tickets. Custom CSS and the AI writing review are the largest single pieces.
2. **HTML** adds a converter or sanitiser on Search, Chat, Export, Agents, PDF and DOCX paths.
3. **The Next.js PDF route** is new infrastructure: the backend calls the frontend server, and how that call is authenticated is not decided.
4. Any code ported from Reactive Resume keeps its MIT licence notice.

## 4. Still open

- The Career screen layout (a panel beside the rail or not) and its place in `docs/DESIGN.md`.
- The look of the 3 templates.
- Which marks and blocks Tiptap allows (the sanitiser allowlist follows from it).
- How the backend authenticates to the Next.js PDF route.
- How the wider Career features (Knowledge, Coach, workspace, Offers, Today) and the email drafting fit; see section 7.

## 5. Write-up to do

- `CONTEXT.md`: Resume, Cover Letter, Application, Career (and update Item to list the new types).
- New ADRs: HTML rich text for Resumes and Cover Letters; PDF rendering with react-pdf plus the Next.js route; amending which Item types exist.
- `docs/DESIGN.md`: the Career module.
- An epic with sub-issues in build order: Application record → Resume schema, tables, CRUD → Career library → editor store → Write → templates + PDF → Design → versions → Cover Letters → import → export → Check → AI pieces → custom CSS.

## 6. Order relative to the rest of Career

Reactive Resume's own "Career" area (Knowledge, Coach, workspace, Offers, Today) **depends on** Applications and on Resumes and Cover Letters: it reads documents and reads and changes applications. Resumes and Cover Letters do not depend on it. Only the minimal Application record must come before Cover Letters.

## 7. Added after the session: application email drafting

The owner wants the Resume and Cover Letter part to also **draft an application email for a specific job**: the email that carries the resume and letter to the employer. To be grilled with the wider Career module.
