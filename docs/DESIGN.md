# CoreEx frontend design

The agreed design for the frontend redesign. It records **what** the UI looks like and how it behaves. The UI stack choice is in [ADR 0006](adr/0006-tailwind-shadcn-and-motion-for-the-ui.md), and how we work is in [DEVELOPMENT.md](DEVELOPMENT.md). Terms follow [CONTEXT.md](../CONTEXT.md).

- **Visual reference:** the "CoreEx Design Directions" canvas (private artifact, ask the owner for access). Direction **J — Workspace** (Row 4) is the chosen one; the other rows are rejected explorations. The sign-in reference is "Sign in — Centered card" (Row 5).
- **Status:** agreed 2026-10-29. Light theme drawn on the canvas ("Light theme — J Home and Note", Row 6) and approved the same day.

## 1. Scope

- A visual and UX redesign of the features CoreEx has today, finished to the standard of a public SaaS product.
- Frontend only, with **one exception: Tag colour**, which needs a backend change (section 4.4).
- Anything that needs other new API data is a follow-up ticket, never faked in the UI (section 13).

## 2. Principles

1. **CoreEx is a platform of modules.** The Knowledge Base is the first module; the MCP server, RAG, Jobs, the Knowledge Graph and integrations come later. The shell must take a new module without a redesign.
2. **Content first.** Chrome is quiet so Notes and Assets are the brightest thing on screen.
3. **One accent.** Mint means "primary action, Link, focus". Tag colours carry meaning, so nothing else competes with them.
4. **Every state is designed:** loading, empty, error and success (DEVELOPMENT.md §11).
5. **Keyboard first, mouse friendly.** Everything has a keyboard path; Ctrl+K reaches everything.

## 3. Information architecture

### 3.1 Module rail (always visible on desktop)

| Position | Entry | Who |
|---|---|---|
| Top | CoreEx logo, collapse button | All |
| Modules | **Home**, **Knowledge Base**, **Assets**, **Graph**, **Career** | All |
| Divider, then | **Quick find** (Ctrl K, desktop rail only), **Search**, **Docs**, **Trash**, **Admin** | Admin only for Admin |
| Bottom | Theme toggle, **Account** menu (email, Access tokens, Connect an Agent, Log out) | All |

- Planned modules (Integrations) are **not shown** until they exist. **Career** is shown after Graph (section 3.4).
- **Expanded by default:** every entry shows its icon and label side by side (14rem wide).
- **Resizing:** dragging the rail's right edge changes its width between 12rem and 20rem; the edge shows a `col-resize` cursor and a thin Link-coloured line on hover. The edge is a focusable separator: the arrow keys change the width by 1rem, Home and End go to the limits, and Enter collapses or expands.
- **Collapsing:** to icons only (4rem), with the icon button beside the logo (Tooltip "Collapse sidebar" or "Expand sidebar") or Ctrl+\ from anywhere. Not Ctrl+B, which is bold in the Note editor. Dragged below the minimum, the rail waits at 12rem until the pointer passes the halfway point to 4rem, then snaps shut. It opens again at the width it had before that drag, by the button, the keyboard or dragging out.
- The width and state are kept in the `rail` cookie (`240` or `collapsed:240`), which the server reads so there is no flash. The phone menu Sheet always shows labels, and has no resize edge or collapse button.
- Each icon has an accessible name; when collapsed it also has a Tooltip.
- **Assets** are sources for Notes (and later for text extraction and image analysis), so they are a module of their own, not part of the Knowledge Base. Their pages have no panel beside the rail.

### 3.2 Knowledge Base panel (in the rail)

The panel belongs to the Knowledge Base module: it shows only on Knowledge Base routes (All Items, Folders, Tags, Notes). The Search page, which has an entry of its own in the rail, keeps the module list in view. Home, Assets, Trash, Admin, Settings and Help use the full width, and a future module brings its own panel or none.

**One sidebar, not two (#358).** The panel is not a column of its own: it takes the rail's place. The rail opens on the module list; on a Knowledge Base or Career page it is already showing the panel, under a **Back** button. Choosing Knowledge Base or Career slides the list left and the panel in (a short slide and fade, instant with reduced motion); **Back** slides the list back without leaving the page, so the User can go to another module. Back is forgotten when the module changes. The view out of sight is `inert`, and focus follows the swap (to Back, or to the module's link). While the panel shows, the rail is at least 18rem wide, the width the panel had as a column. A collapsed rail has no room for it: the Knowledge Base and Career icons only navigate, and a **Show the panel** button opens the panel in a Sheet. On phones the menu Sheet drills in the same way.

- Header "Knowledge Base" with a "+" button that follows the active tab: **New Note** on Notes, **New Folder** on Folders, **New Tag** on Tags (the last two ask for a name in a small popover; a duplicate Tag name is refused with a message).
- A **filter field** that narrows the active tab's list in place. Folders and Tags filter in the browser (Folders then show as a flat list, since a match can sit deep in the tree). Notes ask `/panel-notes`, which searches every Note by title. It does not open the command palette.
- A **Notes | Folders | Tags** toggle. The first tab follows the route: Tags on `/tags`, Notes on a Note, otherwise Folders.
- Notes: the 50 most recently updated Notes (the current one marked). Folders: the Folder tree (collapsible, no Item counts yet) and the "In <Folder>" list of Items when one Folder is selected. Tags: one Tag a row (its colour as a dot, then its name) and **Manage Tags**, pinned under the list. Only the list scrolls: the header, filter and toggle stay put, so Manage Tags is always in reach.

### 3.3 Routes

| Route | Screen |
|---|---|
| `/` | Home |
| `/items` | Knowledge Base: All Items (new route; today's list moves here from `/`) |
| `/folders/[id]`, `/tags/[id]` | Same layout as All Items, scoped |
| `/notes/[id]`, `/assets/[id]` | Note, Asset |
| `/assets` | Assets: the same layout as All Items, with Assets only (`GET /api/items?type=ASSET`) and Upload as its one action |
| `/tags`, `/trash`, `/search` | Tags, Trash, full-text Search results |
| `/admin` (tabs: Overview, Users, Invites) | Admin |
| `/settings/tokens` | Access tokens (from the Account menu; no panel beside it) |
| `/docs`, `/docs/mcp` (and the other MCP guide pages, section 6.11) | Docs: the Introduction and the MCP guide, with a sidebar and no panel beside it. `/help/mcp` redirects to `/docs/mcp` |
| `/login`, `/reset-password`, `/invite-only`, `/disabled`, 404, error | Sign-in and system pages |

### 3.4 Career module (being built)

Agreed 2026-11-14 ([ADR 0010](adr/0010-career-items-are-applications-resumes-and-cover-letters.md), decision records in `docs/career/`). The rail entry, the panel and the Applications list are built (#228); each other screen is designed in its own ticket and recorded here when it lands.

- **One rail entry, "Career"**, after Graph. Applications, Resumes and Cover Letters are Items, so they also show in All Items, Folders, Tags, Search and the Graph, and open their Career page from there.
- **A Career panel in the rail**, like the Knowledge Base panel (section 3.2: it replaces the module list under a Back button), shown only on Career routes: **Today**, **Applications**, **Resumes & Letters**, **Knowledge** (Facts, Stories, Preferences), **Offers**. Only entries whose screen exists are shown: for now **Applications** and **Resumes & Letters**.
- **Applications** has four views: List (grouped by Stage, sorted by Next step), Board (drag between Stages, with Undo), Calendar (interviews) and Insights. One Application opens its details and its workspace tabs: Fit, Apply, Interview prep, Practice, Debrief, Messages (where Application emails live), Library.
- **The Resume and Cover Letter editor** uses the full width with the panel hidden: a form panel beside a real-size page preview, with Write, Design and Check modes (Cover Letters: Write and Design), and the same save status as the Note editor.
- Every AI button carries its one-line "Sends: …" disclosure ([ADR 0013](adr/0013-career-ai-works-only-from-the-users-evidence.md)).

| Route (planned) | Screen |
|---|---|
| `/career` | Today |
| `/career/applications`, `/career/applications/[id]` | Applications views; one Application with its workspace tabs |
| `/career/library`, `/career/resumes/[id]`, `/career/cover-letters/[id]` | Resumes & Letters library; the editors |

The Resume preview offers PDF, Word, Markdown and JSON downloads alongside Print. JSON is a full backup and explicitly says that it includes private notes; Word and Markdown omit them. Markdown is unavailable until changes are saved and while previewing a different version or an unapplied template.

In Resume Check, the form panel lists categorized findings and a score, with actions to edit, ignore or apply an available fix. The preview can show the PDF's extracted text beside the page and compare it with the Resume. A selected Application's posting can also be compared locally with the Resume; keywords are suggestions, not a fit score.
| `/career/knowledge`, `/career/offers` | Knowledge; Offers |

## 4. Design tokens

All colours are CSS variables on `:root` with a dark and a light set, consumed by Tailwind v4 `@theme` and the shadcn token names. Never hard-code a colour in a component.

### 4.1 Colour

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--background` | `#09090B` | `#FFFFFF` | Page |
| `--panel` | `#0F0F12` | `#FAFAFA` | KB panel, Details panel |
| `--surface` | `#18181B` | `#F4F4F5` | Cards, inputs |
| `--surface-raised` | `#1C1C20` | `#FFFFFF` | Popovers, hover cards (light adds a shadow) |
| `--border` | `#27272A` | `#E4E4E7` | Borders |
| `--border-subtle` | `#1F1F23` | `#F0F0F2` | Dividers |
| `--foreground` | `#F4F4F5` | `#09090B` | Text |
| `--muted-foreground` | `#A1A1AA` | `#52525B` | Secondary text (≥ 6.9:1 on surface) |
| `--disabled` | `#71717A` | `#A1A1AA` | Disabled and decorative only, **never body text** (fails 4.5:1) |
| `--primary` | `#69F1AF` (Mint) | `#69F1AF` | Primary button fill, logo |
| `--primary-foreground` | `#09090B` | `#09090B` | Text on Mint (14:1) |
| `--link` / `--ring` | `#69F1AF` | `#047857` | Links, focus ring, Mint used as text (light: 5.5:1), progress bars and other thin Mint graphics |
| `--success` | `#4ADE80` | `#15803D` | "Saved" dot, success toasts |
| `--destructive` | `#F87171` | `#B91C1C` | Delete forever, errors |

### 4.2 Typography

| Role | Font | Notes |
|---|---|---|
| UI, headings | **Manrope** 400 / 500 / 600 / 700 | Page titles 40–44px, weight 600, letter-spacing −0.03em |
| Note content | **Atkinson Hyperlegible Next** 400 / 500 | 16px, line-height 1.75, column max 700px |
| Code, counts, shortcuts | **Geist Mono** 400 / 500 | Code blocks, `Ctrl K` hints, sizes, counts |

Fonts load through `next/font/google` (self-hosted at build time, no runtime request to Google).

### 4.3 Shape, space, elevation

- Radius: 6px (badges), 8–10px (inputs, buttons, tree rows), 14px (cards), 18px (dialogs), full (Tag pills).
- Spacing: Tailwind's 4px scale. Panels pad 14–20px; main content pads 32px desktop, 16px phone.
- Elevation: dark theme uses borders and surface steps, not shadows; popovers and hover cards get one soft shadow. Light theme adds a subtle shadow to cards.

### 4.4 Tag colours

A **Tag colour** (CONTEXT.md) is one of 8 names. The API stores the **name**, never a hex value, so the palette can change per theme.

| Name | Dark text | Light text | Base (for the tinted background) |
|---|---|---|---|
| gray | `#D4D4D8` | `#3F3F46` | `#A1A1AA` |
| red | `#FCA5A5` | `#B91C1C` | `#EF4444` |
| orange | `#FDBA74` | `#9A3412` | `#F97316` |
| yellow | `#FDE047` | `#854D0E` | `#EAB308` |
| green | `#86EFAC` | `#166534` | `#22C55E` |
| teal | `#5EEAD4` | `#115E59` | `#14B8A6` |
| blue | `#93C5FD` | `#1D4ED8` | `#3B82F6` |
| pink | `#F9A8D4` | `#BE185D` | `#EC4899` |

- Pill background: the text colour at 16% (dark) or 12% (light) over whatever is behind it. Every pair was checked at ≥ 4.5:1 on both the page and the surface colour.
- A Tag with no colour picked gets one **derived from its name** (a stable hash of the lower-cased name, modulo 8), so the same Tag looks the same everywhere.
- The Tag name is always shown: colour is never the only signal.

### 4.5 Motion tokens

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150ms | Hover, toggles, tooltips |
| `--duration-base` | 200ms | Menus, popovers, hover cards, dialogs |
| `--duration-slow` | 320ms | Panels, sheets, page transitions |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entering |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Moving, layout |

The same tokens are used by CSS, Motion and View Transitions. They are defined once in `frontend/lib/motion.ts`, which Motion reads directly and the root layout sets as CSS variables on `<html>`.

## 5. Theme and preferences

- Dark and light themes. Default: follow the OS (`prefers-color-scheme`). The theme toggle overrides it and is stored in a **cookie** (`theme=dark|light|system`) so the server renders the right theme with no flash.
- The Details panel open/closed state is also stored in a cookie.
- One accent only (Mint). Fonts are fixed; there is no font preference.

## 6. Screens

### 6.1 Home (`/`)

1. Greeting and quick actions: **New Note**, **Upload**, **Import Markdown**.
2. **Jump back in:** recently opened Items (the endpoint behind the quick switcher).
3. **Recently edited:** the latest 6 Items as cards (title, Note/Asset icon, Folder path, relative time). No text preview yet.
4. **Stats strip:** total Items, number of Tags, storage meter (used of Storage Quota).
5. **Your Tags:** top Tags by Item count, in their Tag colours, linking to the Tag page.

### 6.2 All Items, Folder and Tag pages

- Header: breadcrumb, title, a **Grid | List** toggle, and actions (New Note, Upload, Import). The choice is remembered (the `view` cookie); like Google Drive, the Items open as a grid until the list is chosen.
- The **Folders** and **Items** sections fold away from their headings, and each remembers its state (the `collapsed` cookie).
- **Folder cards** (drawn folder illustration): top-level Folders on All Items, sub-Folders on a Folder page, none on a Tag page. No Item counts yet.
- **Items, Grid:** a card per Item (icon, title, Folder and date). The title's link covers the card.
- **Items, List:** a table with Title (with Note or Asset icon), Folder, Updated; cards on a phone.
- Both are paginated by the API and share one menu: right-click (Context Menu) and a "⋯" button give Open, Open in new tab, Move to Folder, Add Tag, Move to Trash (with Undo). The Assets page uses the same layout.
- No type filter (the API cannot filter by type; a client-side filter on one page would show wrong totals).

### 6.3 Note (`/notes/[id]`)

- **Header bar:** Folder breadcrumb, save status (Saved, Saving, Unsaved), Move to Trash (icon button with Tooltip), Details toggle.
- **Conflict:** a clear Alert banner above the editor with **Keep mine** and **Load theirs**. Load theirs first keeps what was typed as a new Note named "<title> (mine)" (same Folder, same Tags, its heading renamed to match), then loads the stored Note and shows a status line above the title with a link to the copy and **Dismiss**. If the copy cannot be made, nothing is loaded and the banner says why; if only its Tags fail, the line says so.
- **Unsaved text is kept in the browser** (`localStorage`, one entry per tab and Note, under `coreex:unsaved:`) from every edit until it is saved. Opening a Note puts back the newest entry that differs from the stored Note, with "Restored changes that were not saved yet" (a card with **Dismiss**) and saves it; if the Note was saved elsewhere since, the Note opens in the conflict state instead. Entries older than 7 days are dropped, and **Log out** clears them all.
- **Changes made elsewhere show up on their own.** While the tab is visible, an open Note asks every 10 seconds (and once when the tab becomes visible again) whether it was changed by an Agent or in another tab (`GET /api/notes/{id}/latest`, no text). With nothing unsaved, the new text is loaded and a card says "Changed by ‹Access token› just now" (or "Changed in another tab or device"); with unsaved text the conflict banner opens at once and names who changed it. The three cards above the title (a kept copy, restored text, a loaded change) share one place and one **Dismiss**. Items lists, Folders and the Graph do not update live.
- **Writing column** (max 700px, centred): title field, Tags as coloured pills with "+ Tag" (Combobox), a **formatting toolbar**, then the CodeMirror editor with the existing live preview and `[[Link]]` autocomplete, in Atkinson Hyperlegible Next.
- **Formatting toolbar** (a `role="toolbar"`, arrow keys move between buttons): heading level (Normal, 1 to 3), bold, italic, strikethrough, inline code, bulleted, numbered and checklist, quote, code block, link, `[[Link]]`, table, divider. Only what Markdown can express (ADR 0002), so no font size or colour. Each button toggles on the selection and shows pressed when the caret is already inside that format. Ctrl+B and Ctrl+I are shortcuts (Ctrl+K stays the command palette).
- **Slash menu:** typing `/` at the start of a line or after a space opens a list of blocks (Heading 1 to 3, Bulleted list, Numbered list, Checklist, Quote, Code block, Link to a Note or Asset, Table, Divider); typing filters it, Enter inserts the block and removes the `/text`, Escape closes it. A `/` inside a word, a URL or code opens nothing. It is CodeMirror's autocomplete list, so it is keyboard operable and announced like the `[[Link]]` suggestions.
- **Focus mode:** the last button of the toolbar, or Ctrl+Shift+F, hides the rail, panel, header, Tags and toolbar and leaves the title and text centred in the window, with the save status and an Exit button on a thin bar at the top. Escape leaves it (first it closes an open menu). The rest of the page is `inert` while it is on. The editor is not rebuilt, so the caret and unsaved text stay.
- **Title and first line stay in step:** a first line written as `# Heading` is the Note's title. Typing in it changes the title field, and typing in the title field rewrites that line (or puts a heading in front when the Note has none). An empty title leaves the body alone and shows "Untitled". A Note whose title and heading already differ keeps both until one is edited.
- **Link hover preview:** hovering *or focusing* a `[[Link]]` shows a Hover Card with the target's title, type, Folder and first lines (from the existing Note and Asset endpoints).
- **Details panel** (right): Folder (the site's own Select, indented by depth), Backlinks as cards, **Mentioned without a Link** (Notes that contain this Item's exact title, as whole words outside code and links, with a count; each card has the Note, a snippet with the mention marked, and **Link it**, which saves that Note with the mention wrapped, or says so if it changed meanwhile; the first 10 and **Show more** for 50; titles under 3 characters list nothing), **Connections** (the local graph, section 6.12), **History**, Info (Created, Updated, word count computed in the browser). **History** is a folded section that loads when opened: the Note's Note versions, newest first, each a card with when it was written, who wrote it ("You" or the Access token's name), its title, **Preview** (the text, read-only, in a scrolling box) and **Restore**. Restore first sends any unsaved typing, then puts the earlier text in the editor and says so in a toast; the text it replaced becomes the newest version, so a restore can be undone. It is held back while a Conflict is open. Dividers separate the sections: details, organization (Folder, Tags, Backlinks, Connections) and Info last. Open by default on wide screens, closed on narrow ones; the choice is remembered.

### 6.4 Asset (`/assets/[id]`)

- Same header and Details panel as a Note; header adds **Download**.
- A neutral **viewer stage**: the image fitted, or the PDF in its viewer.
- Details panel: title and description (edited in place: a faint border and a pencil beside each label show they can be changed, with a gap between label and field), Folder, Tags, Backlinks, Connections, Info (type, size, updated), in three sections with dividers.

### 6.4a Application (`/career/applications/[id]`)

A Career screen (#227), opened from the Applications list below.

- A single column: the title, then a **Stage stepper** (six buttons, the current one filled and `aria-current="step"`), the fields (title, company, role, location, posting link, posting) with one **Save**, and the **Timeline** (#229).
- Closing: the Closed button first asks "Why did it close?" (the five close reasons); the page then shows "Closed: <reason>". A **Moved on** date field (empty means today) back-dates a move.
- Timeline: lines in date order, same-day lines in the order they were written. Each line has **Edit** (its date, and a note's text); notes, follow-ups and replies also have **Delete**, a Stage line does not. Below it, a note box with a date field and the buttons **Add note**, **I followed up** and **They replied**. A date cannot be in the future.
- Interviews (#230): above the Timeline, a list with **Add interview** (time, type phone / video / onsite / other, notes), **Edit** and **Remove**. Times are drawn in the browser's timezone and stored as an exact instant; interviews show on the Timeline read-only. An interview counts as ended one hour after it starts.
- **PDFs you sent** (#242), below the page: the PDFs actually sent for this Application, each with its name (a link to the Asset), its label (Resume, Cover letter or Other), its size, **Download** and **Detach**. **This PDF is a** picks the label and **Attach a PDF** uploads one through the usual upload (type, size and quota are checked as for any Asset); it then shows in Assets as well. Detach takes it off the Application and leaves the Asset; trashing the Application leaves its Assets alone. Empty: "Nothing attached yet."
- Follow-up reminder: one per Application, a date and an optional time (date alone means 09:00 in the User's timezone), with **Set reminder** and **Clear reminder**. **I followed up** clears it.
- The page uses the Item frame of Notes and Assets (#239): a breadcrumb (Applications, then its Folder path), **Move to Trash** in the header, and a **Details** panel (remembered, a bottom Sheet on phones) with its **Folder** and its **Tags**. It is listed in its Folder and in All Items, and a Folder or Tag page opens it here. The Details panel also shows its **Backlinks** (Notes that link to it with `[[Role at Company]]`) and the Notes that mention its title without a Link, each with **Link it** (#240).
- A save from an old version, or a move made meanwhile elsewhere, shows the conflict message and asks for a reload.

### 6.4b Applications (`/career/applications`)

- Header with the title and **New Application**, a Dialog that lands on the new Application's page: a **Link to the posting** with **Read link**, then Company, Role, Location and the pasted Posting. **Read link** (#236) asks the API to read the page and fills only the fields still empty (typed text is never overwritten), then says what it filled ("Filled in Company, Location, Posting. Check them before saving.", or that the page had no job data); a refused or unreadable link shows its reason in an alert. The link is stored as the Application's posting link. **Fill with AI** (#237): under the Posting, a line says what it does ("Fill with AI sends the posting text above to Claude, made by Anthropic, and uses part of your daily AI budget. Nothing else of yours is sent.") above the **Fill with AI** button, which waits until there is a posting. The AI fills only the fields still empty (never typed text); a posting that came from a link may be replaced by its cleaned version, a typed one never. When Read link found no job data the button turns primary with "The page had no job data. The AI can read it.". Without the owner's AI key the dialog says so up front, with no error: "Fill with AI is coming soon. It switches on once the owner sets up the AI key, and nothing is sent anywhere until then." and a disabled **Fill with AI (pending)** button (the status comes from `GET /api/ai/status`). A spent daily budget, an unavailable provider or an unusable answer show their own message in an alert and change nothing. **No duplicates** (#238): a posting link whose canonical address (scheme, host without "www.", path and the job-id parameters only; tracking and secret parameters, a fragment and a trailing slash do not count) matches another live Application of the User's is refused with "That posting is already tracked." and a link to the Application that holds it; a trashed one does not count. **Applied before**: when the Company is left, the dialog (and the Application's own page) shows "You applied to X before and never heard back: <links>. Think about whether to try again." for the User's earlier Applications at that company (case and spacing ignored) closed with no response, now or earlier. The API reads the page's JobPosting data first, else its title and visible text, and only from public addresses (see below). `/career` redirects here.
- A **Show** toggle of two links, **All** and **Needs you** (`?needs=1`, so it survives a reload and a shared link). Needs you keeps only Applications whose Next step is due now.
- The User's Applications grouped by Stage, in Stage order, each group under a heading. Within a group they are sorted by Next step: those due now first, the earliest due first, then the rest. A row is the title, then the Next step (a due one reads "Needs you: ..." in the stronger colour) and when it was last updated. Each row opens the Application. Paged like the Items list.
- **Selecting** (#232): a checkbox on each row (Shift-click selects the range from the last one clicked) and one on each Stage heading for the whole group. While any are selected a **Bulk actions** bar sticks to the top: "N selected" and **Clear selection**; **Move to** a Stage with **Move** (Closed adds "Why did they close?", one reason for all); a Tag name with **Add Tag**, and a Tag picker with **Remove Tag**; **Move to Trash**. Each action is one request; a toast says how many worked, a second lists any that failed (they stay selected), and Move to Trash has **Undo**, which restores them.
- A row also shows the Application's Tags as coloured pills under its Next step line.
- Empty: "No Applications yet. Add the first job you are interested in." Empty under Needs you: "Nothing needs you right now."
- The Application page starts with a **Next step** card: the label, and "Needs you now." when it is due.
- Next step kinds, tried in this order: Closed; Offer ("Decide on the offer"); an upcoming interview ("Interview Mar 5, 17:30", due from 24 hours before it starts); interview feedback (an interview ended an hour after it started, with no later timeline entry); follow-up due (the reminder's moment has passed); not applied yet ("Apply"); no reply for 10 days since applied or the last follow-up; otherwise Waiting. Times in labels are in the User's timezone, which the browser reports in a `tz` cookie (UTC until it does).
- **Board** (#233, `?view=board`, beside a **View** toggle of List and Board; it keeps Needs you): six columns in Stage order, each headed with its Stage and count, cards in Next step order (a card is the title, the Next step and a **Move to** menu). Drag a card to another column, or pick a Stage in its menu: it shows there at once and a toast says "Moved ... to ..." with **Undo**. The move is sent only when the toast closes, naming the Stage the card was seen in. If the Application was moved elsewhere meanwhile, the server refuses, the card snaps to where it now is and a message says so; a note added meanwhile does not refuse it. Dropping on Closed first asks "Why did ... close?". A page of up to 100 Applications; on a narrow window the columns scroll sideways.
- **Calendar** (#234, `?view=calendar`, the third link of the **View** toggle; Show does not apply and is hidden): interviews and follow-up reminders on the day they fall on in the User's timezone (an interview at 23:30 in Los Angeles is on that day, not the next UTC day; a reminder is a plain day). A month of Monday-first weeks headed "November 2026" with **Previous month**, **Today** and **Next month**; the month is `&month=2026-11` in the address. Each day shows its number (today is marked) and its entries in time order: the time and kind ("14:30 Video interview", "09:00 Follow up") over the Application's title, a link to that Application. At phone width one week at a time (`&week=2026-11-16`, the Monday) with **Previous week**, **Today** and **Next week**, each day labelled with its weekday. Days outside the shown month have the surface fill. Before the browser's `tz` cookie exists the days are worked out in UTC.
- **Insights** (#235, `?view=insights`, the fourth link of the **View** toggle; Show is hidden): what is working in the job search, for the Applications **applied to** (those with an applied date) inside a range. Two date fields **From** and **To** (empty means no limit, both ends included, kept in the address) with **Show** and **Clear dates**. Three tiles: **Applied to** (a count), **Reply rate** (a percent, "3 of 5 had a reply") and **Median time to first reply** (days, "None" when nobody replied). **How far they got**: a bar and a count for Applied, Screening, Interview and Offer, each counting every Application that reached that Stage or went past it. **Why they closed**: the close reasons, the most common first. A reply is a logged "They replied", a move into Screening, Interview or Offer, or a close by the employer (accepted, not selected, accepted another offer); withdrawing and no response are not replies. Back-dated entries count by their own date. Nothing applied to shows "Nothing applied to yet. Move an Application to Applied and its figures show here."; a range with none shows "No Applications were applied to in these dates.". "Tailored vs base resume" and PNG export are not here (they need the Resume epic).

### 6.5 Uploading

- An **Upload dialog** opened from header buttons, Home quick actions and the command palette, with a drop zone and a per-file list (Attachment + Progress).
- Dropping files anywhere in the Knowledge Base shows a **full-window drop overlay**.
- The rules do not change: `.md` and `.txt` files are Imported as Notes; other files become Assets.

### 6.6 Command palette (Ctrl+K)

- **Quick find**, not the Search page: it jumps to an Item by title or runs an action. Ctrl+K, the rail's Quick find entry and the phone header icon open it; the panel's filter field is separate and only narrows its own list. The Search entry in the rail opens the `/search` page, which reads all text and also matches by meaning. The rail shows only Search as current on that page, and the phone menu has Search but no Quick find (its header icon is Quick find).
- The field says what it does ("Jump to an Item or run an action…"); with no title match the list says "No titles match" and still offers the last row.
- Empty query: recently opened Items, then actions (New Note, Upload, Import, Go to Trash, Toggle theme).
- Typing: instant title matches (`/api/search/quick`) with Folder paths.
- Last row: **Search all text for "…"**, which opens the `/search` results page.

### 6.7 Trash, Tags, Search, Admin

- **Trash:** table of Items and Folders with "N days left" badges (30-day rule), Restore, and **Delete forever** behind an Alert Dialog.
- **Tags:** list with Item counts; each row has a **colour picker** (Popover with 8 swatches), rename, and delete (Alert Dialog).
- **Search results:** list of hits with highlighted snippets and Folder paths, paginated. Notes are found by words and by meaning, merged into one list; a hit found only by meaning shows the start of its closest piece of the Note, not highlighted. When the search by meaning could not run, a muted line under the count says "Showing exact-word matches only" (ADR 0008).
- **Admin:** tabs **Overview** (stats, storage Chart against the hosting limit), **Users** (table, Storage Quota with an "MB" Input Group, disable/enable/remove), **Invites**. Admin never shows another User's content (ADR 0004).

### 6.8 Sign-in and system pages

- **Centered card** on the background: logo, "Sign in to CoreEx", the invite-only sentence, Email, Password with "Forgot password?", **Sign in** (Mint), **Create account with your invite** (secondary).
- Invite-only, Disabled, 404 and error pages use the same frame with the Empty component and one clear next action.
- No marketing content. Explaining CoreEx to strangers is the job of the future landing page (section 13).

### 6.10 Access tokens (`/settings/tokens`)

Opened from **Access tokens** in the Account menu. Title, one sentence on what an Access token lets an Agent do, and **New Access token**. A table of the User's tokens: Name, Created, Last used ("Never used"), Expires (a date, "Never", or an orange **Expired** Badge) and **Revoke** behind an Alert Dialog. On a phone each row becomes a card, as in Admin Invites. Empty state: "No Access tokens yet". (The Details panel of a Note or Asset shows an **Edited by** row, with the token's name, while an Agent made its latest content change; the User's next save clears it.) The New Access token Dialog asks for a Name and an Expires-after Select (30 days, 90 days default, 1 year, Never); on success the same Dialog shows the secret once in a read-only field with **Copy token** and **Done**, and says it is never shown again.

### 6.11 Docs (`/docs`)

**Docs** is a rail entry above Trash (book icon; a Tooltip when the rail is collapsed; current on every `/docs` page). Its pages are the in-app documentation, written for Users. Every page under `/docs` has the same frame (`components/docs/docs-frame.tsx`), inside the signed-in shell and with no Knowledge Base panel:

- **Sidebar** on the left, in two groups, **Getting started** and **MCP**. The pages and their order come from one list, `frontend/lib/docs.ts`, which also drives the previous and next links at the foot of each page. The current page is marked.
- **On this page** on the right (from `xl`, 1280px, sticky) lists the page's `h2` and `h3` headings and marks the one nearest the top of the screen. Below `xl` the same list sits above the text. Each heading has a "#" link to its own address.
- **Copy page** above the text copies the page's text (the Copy buttons of code blocks are left out).
- Below `xl` the sidebar is a Sheet, opened by **Docs pages**; choosing a page closes it.

Pages so far: **Introduction** (`/docs`) and the MCP guide. The Account menu's **Connect an Agent** item opens the guide at `/docs/mcp`, and `/help/mcp` redirects there.

### 6.11a MCP guide (`/docs/mcp` and its pages)

The guide is for Users, in the shape SaaS products such as Linear, Notion and Stripe use for theirs. It is split into short pages, each a sidebar entry in the **MCP** group, in this order:

- **Overview** (`/docs/mcp`, titled "MCP server"): what MCP is, a **Create an Access token** button, **What an Agent can do** and seven-to-ten example prompts (Notes, Career, Resumes and Cover Letters).
- **Quick start** (`/docs/mcp/quick-start`): three numbered steps: create an Access token (shown once), copy the server address, and add both to your tool.
- **Connect a client** (`/docs/mcp/connect`): the server address in a code block, then a tablist of **Claude Code**, **Codex**, **Claude Desktop** and **Other client**. Each panel has its commands, each with a Copy button named after its file or command. The tabs follow the application workspace's pattern: arrow keys, Home and End move between them.
- **Tools** (`/docs/mcp/tools`): one table per group (Notes, Items, Folders and Tags, Search and Graph, Assets and uploads, Trash, Applications, Resumes, Cover Letters, Career Facts). Each row has the tool's name, a **Read** or **Change** label (text, not colour alone), what it does and "Use it when". A filter box narrows the tables by name (spaces count as underscores); with nothing matching, it says so and offers to show every tool. The grouping and filter logic is `frontend/lib/mcp-tool-groups.ts`. On a phone each row becomes a stacked block. Summaries follow the server's own tool descriptions (`backend/.../mcp/*Tools.java`), so when a tool changes, its summary changes in the same PR.
- **Security** (`/docs/mcp/security`): what a token can do, one token per tool, revoking, the Trash, **Edited by**, where Notes go, and prompt injection. The token warning ("a token is a full key") appears here only.
- **Limits** (`/docs/mcp/limits`): the server's defaults.
- **Troubleshooting** (`/docs/mcp/troubleshooting`): the errors people meet most, each a native `<details>` item.

Rules that hold on every MCP page:

- The commands show this installation's own address (`API_URL` + `/mcp`, read on the server, `frontend/lib/mcp-server.ts`) and the placeholder `cx_pat_YOUR_TOKEN`, never a real token.
- Links inside a sentence are always underlined; the sidebar and the "On this page" list are not sentences.
- The tool list comes from `frontend/lib/mcp-tools.ts`. `McpDocsTest` fails when it differs from the tools the server has.
- **Adding or changing an MCP tool means updating `frontend/lib/mcp-tools.ts`** (name, group, kind, summary, "Use it when") in the same change. `McpDocsTest` also fails when a tool has no group or a group has no tool. `docs/MCP.md` holds no tool list.

### 6.12 Graph (`/graph`)

The Knowledge Graph of one Folder and its subfolders (`?folderId=`), or of All Items. It opens from **Graph** in the rail, which has a **Folder** Select (first choice "All Items", then top-level Folders only, since a Folder's graph already holds its subfolders; a subfolder opened through `?folderId=` is added as one more choice so the Select names what is shown), and from a third **Graph** button in the Grid | List toggle of All Items and every Folder page. On the Graph page the same toggle goes back to the list. Obsidian's graph is a reference for the feel, not a template; the look is CoreEx's own:

- **Shape shows the kind:** Notes are circles and Assets are rounded squares, both `muted-foreground`. The node under hover or focus is `foreground`. A node grows with its Link count (radius 5 to 18).
- **Mint only for Links and focus** (principle 3): Links are thin `muted-foreground` lines. Hovering or focusing a node turns its Links Mint (`--link`) with an arrow for direction, and dims everything not connected to it.
- **Stubs:** an Item outside the Folder that is linked to or from inside it is a dashed, hollow node, joined by dashed Links. Its hover card says "In <Folder>".
- **Hover card:** the popover style of the Link preview (section 6.3): title, then "Note · 2 Links · 1 Backlinks". It also shows for the focused node, so nothing is hover-only.
- **Canvas:** a bordered panel (70vh) with a faint dot grid in `--border`. Zoom in, Zoom out, Fit and **Full screen** buttons sit in its bottom-right corner, each with a Tooltip and an accessible name. Fit (corner-brackets icon) puts every node, unlinked ones included, inside the panel with 48px of padding. Full screen (maximize icon, hidden where the browser cannot do it) uses the Fullscreen API on the panel; Escape or the button (now "Exit full screen") returns, and the graph refits to the new size. The wheel zooms and dragging the background pans. Dragging a node moves it and saves its place in the Graph layout (no Save button, and a toast if it fails). Saved nodes stay pinned and new Items settle around them. **Reset layout** (beside Fit) forgets that graph's saved places and fits the fresh layout.
- **Labels** fade in with the zoom: hidden at 1× and below, fully shown from 1.5× up (`labelOpacity` in `frontend/lib/graph.ts`), and always shown for the hovered or focused node and its neighbours. Only labels on screen are drawn, biggest node first, and a label that would land on one already placed is skipped (`visibleLabels`), so zooming in stays fast and labels never collide.
- **Motion:** the graph opens nearly settled and then settles live (the d3-force simulation runs one tick per frame). Dragging a node holds it under the pointer and its neighbours follow. Dimming and the Links turning Mint animate with `--duration-base` and `--ease-out`. With `prefers-reduced-motion` the layout is run to rest before the first paint, dragging moves only the node, and the transitions are instant (the global rule in `globals.css`).
- **Touch:** one finger pans or drags a node, two fingers pinch to zoom and pan together around their midpoint, and a tap opens the Item. A long press (500 ms) shows the hover card and lights the neighbours without opening anything, and tapping the background clears it. Small dots have an invisible 24 px target on coarse pointers.
- **Keyboard:** every node is a link with a name such as "Energy, Note, links to 2: Sound, Atoms, linked from 1". Tab reaches it, Enter opens the Item, and the arrow keys move to the neighbour lying most nearly that way.
- **Show as table:** the same graph as a table of each Item, Kind, Links to, Linked from and Tags, listing only what the filters match. **Links to** and **Linked from** sort by how many, and **Only orphans** narrows it to Items with no Links.
- **Find an Item:** a box in the header (Links mode, not the table), and `/` focuses it from anywhere on the page. It lists up to 8 loaded Items whose title contains the text. Choosing one pans and zooms to it (a jump with reduced motion), moves keyboard focus to it and lights it and its neighbours, until the User clicks the background, presses Escape or finds another. **Show in Graph** in the Ctrl+K palette does the same for the top Note, through `/graph?focus=`. An Item not in the view says so in a note above the filters.
- **Insights:** an **Insights** button (Links mode, not the table) opens a 16rem panel on the right of the canvas, closed by default so the canvas keeps its width and remembered in the `graph-insights` cookie. Below `lg` it is a Sheet that closes when an answer is chosen. It answers among what the filters match, so a Tag or Folder narrows it: **No Links** (Items with no Link to another Item in scope, stubs not counted), **Most linked** (the top 5, leaving out Items titled `index` or `log`), and **separate groups** (two or more joined Items, named by the most linked). Each answer is a button that lights its nodes as hover does, and pressing it again clears it. Wording stays neutral: an orphan may be unlinked by design.
- **Filters and colours:** a row under the header, all kept in the address so a view can be shared (`?tag=`, `?type=`, `?linked=1`, `?colour=`). **All | Notes | Assets | Applications** (an Application is a diamond; a Note a circle, an Asset a rounded square) and the Tag chips (any chosen Tag matches) dim what does not match, as hover does; a dimmed node is still reachable by keyboard and its name ends "not in the filter". **Only linked Items** (Links mode) hides stubs and Items with no Link to another Item, and refits. **Clear filters** and a count show while a filter is on. **Colour by None | Tag | Folder**, None by default, so the graph stays calm until asked: by Tag a node takes the colour of its Tag with the most Items in this graph, by Folder a colour from the Folder's path, and anything else stays `muted-foreground`. Tag colours are text-grade tokens (section 4.4), so they clear contrast on the canvas in both themes. A legend in the canvas's top-left corner names the 8 largest groups with their counts, and while colouring is on the node's name and hover card say its Tags and Folder, so colour is never the only signal.
- **Folder panel:** beside the canvas, the Knowledge Base panel's tree (section 3.2) with All Items above it and a filter box (a filter shows a flat list). Choosing a Folder opens its graph, the current one is highlighted, and the tree opens along the path to it. The **Folders** button in the header hides or shows the panel, kept in the `graph-panel` cookie so there is no flash. On phones the same button opens it as a Sheet. The Select stays for top-level Folders, and names the current Folder when the panel is hidden.
- **Links | Tree:** a toggle in the header, kept in the URL (`?mode=tree`). **Tree** draws the Folder hierarchy of the chosen scope instead of the Links: the scope in the middle, with subfolders and Items in rings around it, joined by tree lines. It is radial because the outer ring grows with the number of Items, where a top-down tree would get very wide. Stubs are left out. Folders are hexagons in `muted-foreground`, and clicking one, or Enter or Space on it, opens or shuts it. A shut Folder shows how many things are directly inside it, and the graph fits itself again. With more than 500 Items, every Folder but the scope itself starts shut. Zoom, pan, hover cards, arrow keys (along the tree lines), fading labels and reduced motion work as they do for Links. Nodes stay where the tree puts them: they are not dragged and not saved in the Graph layout, so there is no Reset layout. A Folder's name says what it holds, such as "Work, Folder, 2 inside, collapsed", and its hover card says "Folder · 2 inside".
- **Similar:** a switch in the filter row (Links mode, `?similar=1`, off by default) draws Notes close in meaning and not linked, up to 3 per Note, as faint dotted lines. They are suggestions, not Links: they are not in the layout, have no arrow, are skipped by the keyboard and never show in Backlinks. A status line says how many, or that new Notes take a few minutes to be read. While it is on, Insights adds **Suggested Links**: for each Item with no Links, the Notes it is close to, each with **Link it**, which wraps a mention if the Note has one and otherwise adds the Link at the end of the Note.
- **Load neighbours:** for a stub, and for any node when the graph was cut at 500, a **Load neighbours of <title>** button in the canvas's top-right corner acts on the node last hovered or focused, and E does it from a focused node. The neighbours join the canvas as stubs, near what they link to, without the rest of the graph moving much. They last until the page is reloaded and are never part of the saved view.
- More than 500 Items: the 500 most-linked show, under a note "Showing 500 of N Items. Open a smaller Folder to see them all, or load a node's neighbours." Empty: "Map how your Items connect" with a link back to the list.
- **Local graph (Connections):** the last organization section of a Note's or Asset's Details panel (so on a phone it is in the Details Sheet). The same canvas (`graph/graph-canvas.tsx`), 14rem high, showing the open Item (drawn 1.5× larger) and the Items linked to or from it, with every Link among them. A **1 | 2** switch beside the heading picks how many Links away (`?depth=`, 1 by default). Labels are always shown, since the graph is small. No saved layout and no Reset layout; it fits itself again whenever its data changes (a Note's save that adds or removes a Link refreshes it). Below it a **Links to** list of cards (Backlinks already lists what links in), then **Open in Graph** (the Item's Folder graph). Empty: "No Links yet. Type [[ in the Note to link it."

### 6.13 Export (`/settings/export`)

- Reached from **Export** in the account menu. A narrow page (max 672px): the heading, one line of purpose, **What is in the zip** (Notes as Markdown with Links as written, Assets as their files, Applications as one JSON file each with their timeline, Folders as folders, `manifest.json`; the Trash and Chats are not included; one export a minute) and a primary **Download everything** button with a download icon.
- The button is a plain link to `/settings/export/download`, a route that passes the API's zip through with the User's session. The browser saves it as `coreex-export-<date>.zip` and the page stays. A refusal or failure comes back to the page as an Alert: "You can export once a minute. Try again shortly." (`?error=wait`) or "The export could not be made. Try again." (`?error=failed`).
- No loading state of its own: the page has no data to wait for. Works in both themes and at phone width.

## 7. Component map (shadcn/ui)

Use shadcn components first (DEVELOPMENT.md §11), restyled to these tokens. Reach for the whole catalogue, not only tables and dialogs.

| Area | Components |
|---|---|
| Shell | Sidebar, Tooltip, Avatar, Dropdown Menu, Collapsible, Toggle Group, Scroll Area, Separator, Kbd |
| Command palette | Command (in a Dialog), Kbd, Spinner |
| Home | Card, Item, Progress, Badge, Button Group, Empty, Skeleton |
| Item lists | Data Table, Pagination, Breadcrumb, Context Menu, Dropdown Menu, Empty, Skeleton |
| Note | Breadcrumb, Hover Card, Badge, Combobox, Alert, Toggle, Sheet, Spinner |
| Asset and upload | Aspect Ratio, Field, Input, Textarea, Dialog, Attachment, Progress |
| Trash | Data Table, Badge, Alert Dialog |
| Tags | Item, Popover, Radio Group (swatches), Input, Alert Dialog |
| Search | Item, Pagination, Empty |
| Admin | Tabs, Chart, Data Table, Input Group, Badge, Alert Dialog |
| Feedback | Sonner toasts, e.g. "Moved to Trash · **Undo**" (Undo calls the existing restore endpoint) |
| Phone | Sheet (navigation), Drawer (Details panel) |

The Admin storage "Chart" is a stacked bar drawn with divs and the Tag colour tokens, with its legend as the readable numbers. One bar does not justify the shadcn Chart (recharts, about 100 KB); use that component if a second real chart appears.

## 8. Responsive

| Width | Layout |
|---|---|
| ≥ 1280px | Rail (showing the KB or Career panel in its place, section 3.2) + content + Details panel (open by default) |
| 768–1279px | Rail (the same) + content; Details panel opens as an overlay from its toggle |
| < 768px | Slim top bar (menu, title, search); the same rail in a **Sheet**; Details in a bottom **Drawer**; tables become stacked Item rows; command palette full-screen |

Touch targets are at least 44px on touch devices. No horizontal page scroll at any width.

## 9. Motion

Expressive, but calm where people write.

| Job | Tool |
|---|---|
| Route transitions, shared elements across routes (a Folder card growing into its page), skeleton-to-content | React `<ViewTransition>` (built into React 19.3 / Next 16; no dependency) |
| Component animation: staggered card and list entry, layout reflow when Items move, exit and Undo on Trash, Folder cards opening on hover, command palette | **Motion** (motion.dev) |
| Advanced timelines (Knowledge Graph visuals, landing page) | **GSAP**, added with the first feature that needs it, not now |

- Entry animations on server-rendered content (Home's sections) are CSS (`tw-animate-css` classes), so content never waits for JavaScript to become visible. Motion is for animation that needs state.
- The Note editor does not animate while typing.
- Everything respects `prefers-reduced-motion`: animations are replaced by instant changes or a plain fade.

## 10. Accessibility

- Target: **WCAG 2.2 AA** in both themes.
- Text contrast ≥ 4.5:1 (large text ≥ 3:1), including muted labels, Tag colours and Mint used as text.
- Visible focus ring (`--ring`) on every interactive element; no hover-only actions (Hover Cards also open on focus; Context Menu actions are also in the row "⋯" menu).
- Targets ≥ 24px (44px on touch). Dialogs and Sheets trap focus and restore it on close.
- Checks: an **axe** scan of each main screen in both themes inside the Playwright smoke run, plus a keyboard (and Narrator) pass per screen ticket.

## 11. Copy

- Plain and friendly: short sentences, no jokes, no exclamation marks.
- Glossary terms only: Item, Note, Asset, Folder, Tag, Link, Backlink, Trash. "Move to Trash", never "Delete", for soft deletes; "Delete forever" only in Trash.
- Errors say what happened and what to do next: "Could not move the Note. Try again."
- Empty states: one sentence and one action, for example "No Items here yet" with New Note and Upload; "Trash is empty. Items you move to Trash stay here for 30 days."; "Nothing matches "x"" with Search all text.
- Copy is reviewed with the `design:ux-copy` skill.

## 12. Delivery

One parent issue, "Frontend redesign", with sub-issues, each its own branch and PR into `staging`. `staging` may look half old, half new between PRs; `main` gets one release when all are merged.

1. **Foundation:** Tailwind v4, shadcn/ui, tokens for both themes, fonts, theme cookie, motion tokens, the shared `TagBadge` (derived colour), the Playwright + axe harness, ADR 0006.
2. **App shell:** rail, KB panel, phone Sheet.
3. **Command palette.**
4. **All Items, Folder and Tag pages** (adds `/items`).
5. **Home** (replaces today's list at `/`; after 4, so the Item list always has a route).
6. **Note screen** with Link hover preview.
7. **Asset screen and Upload dialog.**
8. **Tag colour and the Tags page:** backend (stored name, API field), the picker, `TagBadge` prefers the stored colour.
9. **Trash and Search pages.**
10. **Admin.**
11. **Sign-in and system pages.**
12. **Final accessibility sweep:** the full axe run including open states, keyboard and Narrator pass, smoke tests updated.

Every screen ticket adds its screen to the axe check from step 1 and must pass in dark and light.

## 13. Not in this redesign (follow-up tickets)

- A public **landing page**.
- Planned modules in the rail (Career, Integrations) appear only when each module ships.
