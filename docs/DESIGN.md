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
| Top | CoreEx logo | All |
| Modules | **Home**, **Knowledge Base**, **Assets** | All |
| Divider, then | **Trash**, **Admin** | Admin only for Admin |
| Bottom | Collapse toggle, Theme toggle, **Account** menu (email, Log out) | All |

- Planned modules (Graph, Jobs, Integrations) are **not shown** until they exist.
- **Expanded by default:** every entry shows its icon and label side by side (14rem wide). The toggle at the bottom collapses it to icons only (4rem), and the choice is kept in the `rail` cookie, which the server reads so there is no flash. The phone menu Sheet always shows labels.
- Each icon has an accessible name; when collapsed it also has a Tooltip.
- **Assets** are sources for Notes (and later for text extraction and image analysis), so they are a module of their own, not part of the Knowledge Base. Their pages have no panel beside the rail.

### 3.2 Knowledge Base panel (beside the rail)

The panel belongs to the Knowledge Base module: it shows only on Knowledge Base routes (All Items, Folders, Tags, Notes, Search). Home, Assets, Trash and Admin use the full width, and a future module brings its own panel or none.

- Header "Knowledge Base" with a "+" button that follows the active tab: **New Note** on Notes, **New Folder** on Folders, **New Tag** on Tags (the last two ask for a name in a small popover; a duplicate Tag name is refused with a message).
- A **filter field** that narrows the active tab's list in place. Folders and Tags filter in the browser (Folders then show as a flat list, since a match can sit deep in the tree). Notes ask `/panel-notes`, which searches every Note by title. It does not open the command palette.
- A **Notes | Folders | Tags** toggle. The first tab follows the route: Tags on `/tags`, Notes on a Note, otherwise Folders.
- Notes: the 50 most recently updated Notes (the current one marked). Folders: the Folder tree (collapsible, no Item counts yet) and the "In <Folder>" list of Items when one Folder is selected. Tags: the Tag pills and "Manage Tags".

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
| `/login`, `/reset-password`, `/invite-only`, `/disabled`, 404, error | Sign-in and system pages |

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
- **Conflict:** a clear Alert banner above the editor with **Keep mine** and **Load theirs** (today's conflict behaviour, restyled).
- **Writing column** (max 700px, centred): title field, Tags as coloured pills with "+ Tag" (Combobox), a **formatting toolbar**, then the CodeMirror editor with the existing live preview and `[[Link]]` autocomplete, in Atkinson Hyperlegible Next.
- **Formatting toolbar** (a `role="toolbar"`, arrow keys move between buttons): heading level (Normal, 1 to 3), bold, italic, strikethrough, inline code, bulleted, numbered and checklist, quote, code block, link, `[[Link]]`, table, divider. Only what Markdown can express (ADR 0002), so no font size or colour. Each button toggles on the selection and shows pressed when the caret is already inside that format. Ctrl+B and Ctrl+I are shortcuts (Ctrl+K stays the command palette).
- **Slash menu:** typing `/` at the start of a line or after a space opens a list of blocks (Heading 1 to 3, Bulleted list, Numbered list, Checklist, Quote, Code block, Link to a Note or Asset, Table, Divider); typing filters it, Enter inserts the block and removes the `/text`, Escape closes it. A `/` inside a word, a URL or code opens nothing. It is CodeMirror's autocomplete list, so it is keyboard operable and announced like the `[[Link]]` suggestions.
- **Focus mode:** the last button of the toolbar, or Ctrl+Shift+F, hides the rail, panel, header, Tags and toolbar and leaves the title and text centred in the window, with the save status and an Exit button on a thin bar at the top. Escape leaves it (first it closes an open menu). The rest of the page is `inert` while it is on. The editor is not rebuilt, so the caret and unsaved text stay.
- **Title and first line stay in step:** a first line written as `# Heading` is the Note's title. Typing in it changes the title field, and typing in the title field rewrites that line (or puts a heading in front when the Note has none). An empty title leaves the body alone and shows "Untitled". A Note whose title and heading already differ keeps both until one is edited.
- **Link hover preview:** hovering *or focusing* a `[[Link]]` shows a Hover Card with the target's title, type, Folder and first lines (from the existing Note and Asset endpoints).
- **Details panel** (right): Folder (the site's own Select, indented by depth), Backlinks as cards, Info (Created, Updated, word count computed in the browser). Dividers separate the sections: details, organization (Folder, Tags, Backlinks) and Info last. Open by default on wide screens, closed on narrow ones; the choice is remembered.

### 6.4 Asset (`/assets/[id]`)

- Same header and Details panel as a Note; header adds **Download**.
- A neutral **viewer stage**: the image fitted, or the PDF in its viewer.
- Details panel: title and description (edited in place: a faint border and a pencil beside each label show they can be changed, with a gap between label and field), Folder, Tags, Backlinks, Info (type, size, updated), in three sections with dividers.

### 6.5 Uploading

- An **Upload dialog** opened from header buttons, Home quick actions and the command palette, with a drop zone and a per-file list (Attachment + Progress).
- Dropping files anywhere in the Knowledge Base shows a **full-window drop overlay**.
- The rules do not change: `.md` and `.txt` files are Imported as Notes; other files become Assets.

### 6.6 Command palette (Ctrl+K)

- The global search. Ctrl+K and the phone search icon open it; the panel's filter field is separate and only narrows its own list.
- Empty query: recently opened Items, then actions (New Note, Upload, Import, Go to Trash, Toggle theme).
- Typing: instant title matches (`/api/search/quick`) with Folder paths.
- Last row: **Search all text for "…"**, which opens the `/search` results page.

### 6.7 Trash, Tags, Search, Admin

- **Trash:** table of Items and Folders with "N days left" badges (30-day rule), Restore, and **Delete forever** behind an Alert Dialog.
- **Tags:** list with Item counts; each row has a **colour picker** (Popover with 8 swatches), rename, and delete (Alert Dialog).
- **Search results:** list of hits with highlighted snippets and Folder paths, paginated.
- **Admin:** tabs **Overview** (stats, storage Chart against the hosting limit), **Users** (table, Storage Quota with an "MB" Input Group, disable/enable/remove), **Invites**. Admin never shows another User's content (ADR 0004).

### 6.8 Sign-in and system pages

- **Centered card** on the background: logo, "Sign in to CoreEx", the invite-only sentence, Email, Password with "Forgot password?", **Sign in** (Mint), **Create account with your invite** (secondary).
- Invite-only, Disabled, 404 and error pages use the same frame with the Empty component and one clear next action.
- No marketing content. Explaining CoreEx to strangers is the job of the future landing page (section 13).

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
| ≥ 1280px | Rail + KB panel + content + Details panel (open by default) |
| 768–1279px | Rail + content; KB panel and Details panel open as overlays from toggles |
| < 768px | Slim top bar (menu, title, search); rail + KB panel in a **Sheet**; Details in a bottom **Drawer**; tables become stacked Item rows; command palette full-screen |

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
- Planned modules in the rail (Graph, Jobs, Integrations) appear only when each module ships.
