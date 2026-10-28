Status: ready-for-agent

# CoreEx V1 — Spec

Vocabulary follows `CONTEXT.md`. Decisions follow ADRs 0001–0004 in `docs/adr/`.

## Problem Statement

My knowledge is scattered across chat threads, downloaded PDFs, screenshots, and half-finished notes in different apps. When I need something I wrote or saved months ago, I can't find it, and I can't see how the pieces relate: which notes mention a person, which sources a decision was based on. Existing tools either lock my writing into a proprietary format, or are file cabinets that store things without connecting them. I also want, in the near future, to let AI tools such as Claude or Codex work with my knowledge base on my behalf, and most tools aren't built for that.

## Solution

CoreEx is a private, web-based knowledge base. A User writes **Notes** in Markdown with a live-preview editor and uploads **Assets** (images and PDFs) as standalone **Items**. Items are organized into nested **Folders**, grouped with **Tags**, and connected with **Links** (`[[...]]` inside Notes). Every Item shows its **Backlinks**. Users can **Import** existing Markdown or text files as Notes. Deleted things go to a **Trash** for 30 days. Search and a `Ctrl+K` quick switcher find any Item fast.

V1 is invite-only. An **Admin** issues **Invites**, sees storage use, adjusts a User's **Storage Quota**, and can disable Users, but can never read anyone's content.

The architecture (one REST API that owns all rules, with Notes stored as Markdown) is chosen so that V1.5 can add an MCP server as just another API client.

## User Stories

### Accounts and access

1. As an invited person, I want to sign up with email and password, so that I can start using CoreEx.
2. As an invited person, I want to sign up with my Google account, so that I don't need another password.
3. As a person without an Invite, I want a clear "CoreEx is invite-only" message when I try to sign up, so that I know why I can't get in.
4. As a User, I want to log in and log out, so that my knowledge base is only accessible to me.
5. As a User, I want to reset my password, so that I can recover my account.
6. As a User, I want to stay logged in across browser sessions, so that I don't have to sign in every time.
7. As a User, I want to be sure no other User can see any of my Items, Folders, or Tags, so that I can trust CoreEx with private knowledge.
8. As a Disabled User, I want a clear message that my account is disabled when I try to use CoreEx, so that I'm not confused by errors.

### Notes

9. As a User, I want to create a new Note in one action, so that capturing a thought is fast.
10. As a User, I want to give a Note a title, so that I can recognize and link to it.
11. As a User, I want to write a Note in Markdown with live preview (headings, bold, lists, code, checkboxes render as I type), so that writing feels natural but stays plain text.
12. As a User, I want my Note to save automatically while I type, so that I never lose work.
13. As a User, I want to see when a Note was last saved, so that I trust my changes are stored.
14. As a User, I want to be warned if a Note was changed elsewhere (another tab or device) since I opened it, so that I don't silently overwrite newer content.
15. As a User, I want to rename a Note, so that its title stays accurate.
16. As a User, I want to delete a Note, so that I can remove what I no longer need.
17. As a User, I want to see a list of my Items sorted by last updated, so that I can get back to recent work.
18. As a User, I want an untitled Note to still be usable and findable, so that quick captures aren't blocked by naming.

### Assets

19. As a User, I want to upload an image (PNG, JPG, WebP, GIF) as an Asset, so that I can keep screenshots and photos in my knowledge base.
20. As a User, I want to upload a PDF as an Asset, so that I can keep papers and documents in my knowledge base.
21. As a User, I want to drag and drop files to upload them, so that adding Assets is quick.
22. As a User, I want to view an image Asset in the app, so that I don't need to download it.
23. As a User, I want to view a PDF Asset in the app, so that I can read it in place.
24. As a User, I want to download an Asset, so that I can use the original file elsewhere.
25. As a User, I want an Asset's title to default to its filename, so that uploading needs no extra input.
26. As a User, I want to rename an Asset, so that its title is meaningful.
27. As a User, I want to add an optional description to an Asset, so that I can find it by words that aren't in its title.
28. As a User, I want to delete an Asset, so that I can remove files I no longer need.
29. As a User, I want a clear error when a file is too large (over 5 MB) or an unsupported type (including SVG), so that I know why an upload failed.
30. As a User, I want to see how much of my Storage Quota I've used, so that I know how much room I have left.
31. As a User, I want an upload to be refused with a clear message when it would exceed my Storage Quota, so that I understand what to free up.

### Import

32. As a User, I want to import a `.md` file as a Note, so that I can bring in notes from other tools.
33. As a User, I want to import a `.txt` file as a Note, so that I can bring in plain-text notes.
34. As a User, I want to import several files at once, so that migrating a batch is quick.
35. As a User, I want an imported Note's title to come from its filename, so that I don't have to rename every import.
36. As a User, I want `[[...]]` Links inside an imported file to work if matching Items exist, so that imported notes stay connected.
37. As a User, I want a clear error for files over 1 MB or of another type, so that I know why an Import failed.

### Folders

38. As a User, I want to create a Folder, so that I can group related Items in one place.
39. As a User, I want to create Folders inside Folders, so that I can build a hierarchy like `Work/CoreEx/Research`.
40. As a User, I want to see my Folders as a collapsible tree in a sidebar, so that I can navigate my knowledge base.
41. As a User, I want to rename a Folder, so that the structure stays accurate.
42. As a User, I want to move an Item into a Folder (including by drag and drop), so that I can organize it.
43. As a User, I want to move a Folder into another Folder, so that I can reorganize my hierarchy.
44. As a User, I want to be prevented from moving a Folder into itself or one of its own subfolders, so that I can't create an impossible structure.
45. As a User, I want to keep Items outside any Folder (top level), so that I can capture without filing first.
46. As a User, I want to create a new Note directly inside the Folder I'm viewing, so that it's filed where I expect.
47. As a User, I want deleting a Folder to tell me how many Folders and Items it contains before it goes to the Trash, so that I don't delete more than I intended.
48. As a User, I want moving or renaming Items and Folders to never break Links, so that reorganizing is safe.

### Tags

49. As a User, I want to add Tags to any Item (Note or Asset), so that I can group things across Folders.
50. As a User, I want to pick from my existing Tags while tagging, so that I reuse the same Tags consistently.
51. As a User, I want to create a new Tag just by typing it, so that tagging is fast.
52. As a User, I want to remove a Tag from an Item, so that I can correct mistakes.
53. As a User, I want to see all Items with a given Tag, so that I can browse a category.
54. As a User, I want to see a list of all my Tags with how many Items use each, so that I understand my categories.
55. As a User, I want to rename a Tag everywhere at once, so that I can fix naming without retagging.
56. As a User, I want to delete a Tag from everywhere, so that I can clean up categories I no longer use.
57. As a User, I want Tag names to ignore case (`#Research` and `#research` are the same Tag), so that I don't get near-duplicates.

### Links and Backlinks

58. As a User, I want to type `[[` in a Note and get autocomplete of my Items by title, so that linking is fast.
59. As a User, I want the autocomplete to show each Item's type and Folder path, so that I can tell apart Items with the same title.
60. As a User, I want to link to both Notes and Assets, so that I can cite my sources.
61. As a User, I want to click a Link to open the linked Item, so that I can follow connections.
62. As a User, I want a Link to keep working and show the current title after the target Item is renamed or moved, so that connections never silently break.
63. As a User, I want a Link whose target is in the Trash, or which never matched an Item, to look visibly different, so that I can spot broken references.
64. As a User, I want each Item to show a Backlinks panel listing the Notes that link to it, so that I can see everywhere it's referenced.
65. As a User, I want to click a Backlink to open the Note that links here, so that I can navigate in both directions.
66. As a User, I want a Link to a restored Item to work again, so that restoring from the Trash fully undoes the deletion.

### Trash

67. As a User, I want deleted Items and Folders to go to the Trash, so that mistakes are recoverable.
68. As a User, I want to see what's in my Trash and how many days each thing has left, so that I know what's about to be removed.
69. As a User, I want to restore an Item from the Trash, so that I can undo a deletion.
70. As a User, I want restoring an Item whose Folder is also in the Trash to restore that Folder too, so that nothing comes back without a home.
71. As a User, I want restoring a Folder to restore everything that was deleted with it, so that a whole subtree comes back in one step.
72. As a User, I want anything in the Trash for more than 30 days to be removed permanently and automatically, so that the Trash cleans itself up.
73. As a User, I want to permanently delete a single thing from the Trash now, so that I can free storage immediately.
74. As a User, I want to empty the whole Trash, so that I can free storage in one action.
75. As a User, I want Items in the Trash to be hidden from lists, search, Tag views, and autocomplete, so that deleted things don't clutter my work.

### Search

76. As a User, I want to search across Note titles and content, Asset titles and descriptions, and Tag names, so that I can find anything I've saved.
77. As a User, I want to filter search results by Folder, Tag, and type (Note or Asset), so that I can narrow down results.
78. As a User, I want to see a snippet with my search words highlighted, so that I can tell why a result matched.
79. As a User, I want to press `Ctrl+K` (or `Cmd+K`) and type part of a title to jump to any Item, so that I can navigate without the mouse.
80. As a User, I want the quick switcher to show recently opened Items before I type, so that switching back is instant.
81. As a User, I want search to work for text in any language I write in, so that notes in Malay or English are equally findable.

### Admin

82. As an Admin, I want to open an admin dashboard that normal Users can't access, so that I can manage CoreEx.
83. As the owner, I want my email configured as the first Admin, so that I can never be locked out of administration.
84. As an Admin, I want to create an Invite for an email address, so that a specific person can sign up.
85. As an Admin, I want to see all Invites with their status (pending, accepted, revoked), so that I know who has access.
86. As an Admin, I want to revoke a pending Invite, so that I can withdraw access before it's used.
87. As an Admin, I want to copy the sign-up link for an Invite, so that I can send it to the person myself.
88. As an Admin, I want to see all Users with email, sign-up date, last active date, Item count, and storage used compared to their Storage Quota, so that I can spot heavy usage.
89. As an Admin, I want to change one User's Storage Quota, so that I can give a tester more room.
90. As an Admin, I want to disable a User, so that I can cut off access without destroying their data.
91. As an Admin, I want to re-enable a Disabled User, so that disabling is reversible.
92. As an Admin, I want to be unable to disable myself, so that I can't lock out the only Admin.
93. As an Admin, I want an overview of total Users and total storage used compared to the hosting limit, so that I see capacity problems coming.
94. As a User, I want to be certain an Admin cannot read my Notes or Assets, so that CoreEx's privacy promise is real.

## Implementation Decisions

### Shape (ADR 0003)

- Monorepo with two apps: a **frontend** (Next.js, TypeScript, App Router, shadcn/ui + Tailwind) and a **backend** (Spring Boot REST API, Java on the current LTS, Maven, Spring Data JPA, Flyway, Spring Security as an OAuth2 resource server).
- Supabase provides Postgres, Auth, and Storage. Only the backend talks to Postgres and to Storage's management API. The frontend uses Supabase's JS client for **sign-in only**.
- The backend publishes an OpenAPI spec. The frontend's API client and types are generated from it, and nothing is hand-written against the API.

### Backend modules

Each module is a deep module behind a small service interface. Controllers stay thin. Every service method takes the acting User and scopes every query to it (ADR 0001).

- **Identity**: validates the Supabase JWT, resolves or provisions the CoreEx User, enforces the Invite gate and Disabled status, and updates last-active (throttled, at most once every few minutes).
- **Items**: shared Item behaviour, including title, Folder placement, timestamps, soft delete, and listing.
- **Notes**: Markdown content, saving with an optimistic version check, and Import.
- **Assets**: upload intent, upload confirmation, signed download URLs, description, and Storage Quota enforcement.
- **Folders**: the tree, create, rename, move (with cycle prevention), and subtree operations.
- **Tags**: per-User Tag set, case-insensitive uniqueness, assigning to Items, and renaming or deleting everywhere.
- **Links**: parses a Note's Markdown into its outgoing Links on every save and maintains a Link index. Answers Backlinks and title resolution.
- **Trash**: moving to the Trash, restoring (including the ancestor Folder chain), permanent deletion, empty Trash, and the scheduled purge.
- **Search**: Postgres full-text search plus title prefix and fuzzy matching for the quick switcher.
- **Storage**: a narrow interface over Supabase Storage's S3-compatible API (presigned PUT and GET, HEAD, delete). Everything else depends on this interface, never on Supabase directly.
- **Admin**: Invites, User list with usage, quota changes, disable and enable, and the overview. It has no path to Item content (ADR 0004).

### Data model (Flyway-managed)

- **users**: id (the Supabase Auth user id), email, role (`USER` | `ADMIN`), disabled flag, storage quota in bytes (default from configuration), created and last-active timestamps.
- **invites**: email (case-insensitive), status (`PENDING` | `ACCEPTED` | `REVOKED`), created-by Admin, created, accepted, and revoked timestamps.
- **folders**: id, owner, parent folder (nullable means top level), name, timestamps, `deleted_at`, and `trash_batch_id`.
- **items**: id, owner, type (`NOTE` | `ASSET`), title, folder (nullable), timestamps, `deleted_at`, and `trash_batch_id`. A single table, so that Links, Tags, Folders, Trash, and listing treat Notes and Assets uniformly.
- **note_contents**: item id, Markdown body, and version (an integer incremented on each save).
- **asset_files**: item id, storage key, MIME type, size in bytes, optional description, and upload status (`PENDING` | `READY`).
- **tags**: id, owner, name, plus a unique index on owner + lower(name).
- **item_tags**: item ↔ tag.
- **links**: source Note, target Item id, and the display text as written. Rebuilt for a Note on every save. A target that doesn't exist or is trashed is still stored, and shows as unresolved.
- A search vector is maintained over title, Note body, and Asset description, using Postgres's `simple` configuration so non-English text is indexed without English stemming. A trigram index on titles supports the quick switcher.

### Link format in Markdown

- **Stored form:** `[[<item-id>|<title when linked>]]`. The id makes Links survive renames and moves. The title text keeps the Markdown readable outside CoreEx, which matters for export and for MCP.
- The editor displays the target's **current** title, not the stored text.
- If a User types `[[Some Title]]` without using autocomplete, the backend resolves it on save to the single live Item with that exact title and rewrites it into the stored form. If no Item matches, or several do, it stays as written and shows as unresolved.
- Import uses the same resolution.

### Notes saving

- Autosave is debounced on the client. Every save sends the version the client last saw. If the server's version is newer, it returns **409 Conflict** and the UI offers to reload or overwrite.

### Asset upload flow

1. The client asks the API for an upload intent, sending filename, type, and size.
2. The API checks the allowed type (PNG, JPG, WebP, GIF, PDF; never SVG), the 5 MB maximum, and the remaining Storage Quota. It then creates a `PENDING` Asset and returns a short-lived presigned upload URL.
3. The client uploads the bytes directly to Storage.
4. The client confirms the upload. The API checks the stored object's actual size against the limits, then marks the Asset `READY`. On a mismatch, it deletes both the object and the Asset.
5. A scheduled job removes `PENDING` Assets older than 24 hours, along with their objects.

- Viewing or downloading an Asset uses a short-lived presigned GET URL issued after an ownership check.
- Storage Quota usage is the sum of sizes of `READY` Assets, **including Assets in the Trash**, because they still occupy storage until purged.

### Trash semantics

- Deleting sets `deleted_at` and a new `trash_batch_id` on the thing deleted. Deleting a Folder applies the same batch to its whole live subtree (Folders and Items).
- **Restoring an Item** clears it, and also restores any trashed ancestor Folders of that Item, but not the Folders' other contents.
- **Restoring a Folder** restores everything in its batch.
- The purge job runs daily. It permanently deletes anything whose `deleted_at` is more than 30 days old, including Storage objects for Assets.
- "Delete forever" and "Empty Trash" do the same thing immediately.
- Trashed Items are excluded from lists, search, Tag views, autocomplete, and Backlinks. Links to them show as unresolved until they're restored.

### Invite gate and Admin

- Supabase Auth sign-up stays technically open. On every authenticated request, the backend refuses (403, `NOT_INVITED`) any Auth user with no CoreEx User row, unless a `PENDING` Invite exists for their verified email. In that case it provisions the User and marks the Invite `ACCEPTED`.
- The configured owner email is provisioned as `ADMIN` without needing an Invite.
- Disabled Users get 403 `USER_DISABLED` on every request.
- Admin endpoints require `ROLE_ADMIN`, enforced in Spring Security, not only hidden in the UI. An Admin can't disable themselves.
- Invite emails are not sent by CoreEx in V1. The Admin copies the sign-up link.

### Limits (all configuration, not code)

- Asset maximum: 5 MB.
- Default Storage Quota: 100 MB per User.
- Import maximum: 1 MB, `.md` or `.txt`, UTF-8.
- Trash retention: 30 days.
- Pending-upload cleanup: 24 hours.

### API surface (REST, JSON, all under `/api`)

- **Me:** current User, including role, quota, and usage.
- **Items:** list and filter by Folder, Tag, or type; move; rename; delete to the Trash.
- **Notes:** create, read, save (with version), import.
- **Assets:** upload intent, confirm, read (with a signed URL), update description.
- **Folders:** tree, create, rename, move, delete to the Trash.
- **Tags:** list with counts, rename, delete, add to or remove from an Item.
- **Backlinks** for an Item, and **title lookup** for autocomplete.
- **Trash:** list, restore, delete forever, empty.
- **Search:** full search with filters, and quick-switcher lookup.
- **Admin:** Invites (create, list, revoke), Users (list, change quota, disable or enable), overview.
- **Errors:** a consistent error body carrying a machine-readable code (for example `NOT_INVITED`, `USER_DISABLED`, `QUOTA_EXCEEDED`, `FILE_TOO_LARGE`, `UNSUPPORTED_TYPE`, `VERSION_CONFLICT`, `FOLDER_CYCLE`).

### Hosting

- Frontend on Vercel. Backend on a JVM-capable host (Render, Railway, or Fly.io).
- Supabase free tier, with two projects: dev and prod.
- Secrets (the Supabase JWT verification settings, the Storage S3 credentials, the database URL, the owner Admin email) come from environment variables and are never committed.

## Testing Decisions

- **A good test** drives the system through its public HTTP API and checks behaviour a User or Admin would notice, such as "renaming a Note keeps its Backlinks", "an upload over quota is refused with `QUOTA_EXCEEDED`", or "User B gets 404 for User A's Note". It never checks private methods, table layouts, or how a module is wired internally.
- **Primary seam: the backend's REST API.** Tests run the real Spring application against a real Postgres (Testcontainers), using Flyway migrations as in production. Requests carry test JWTs for different Users, Admins, Disabled Users, and people without an Invite, all signed by a test key that the test configuration trusts in place of Supabase.
- **Secondary seam: the Storage interface.** In tests it is replaced by an in-memory fake, so Asset, quota, and purge behaviour is tested without network calls. This is the only fake.
- Every module listed above is covered through the API seam. Ownership isolation (another User's Items are invisible: 404, not 403) gets a test for every resource type.
- Purge and pending-upload cleanup run in tests by calling the scheduled job directly with a controllable clock.
- **Frontend:** a small Playwright smoke suite against a running stack covers the critical paths (sign in, create and edit a Note, link two Notes, upload an Asset, search). There are no component unit tests in V1 unless a component holds real logic, such as the Link autocomplete or Markdown decorations.
- **Prior art:** none. This is a new codebase, and the first tickets establish the test harness that later tickets copy.

## Out of Scope

- MCP server (V1.5), AI chat, RAG, embeddings, semantic search, and the knowledge-graph view (later).
- Searching text inside PDFs or images (OCR or text extraction).
- Sharing, public links, collaboration, teams or workspaces, and real-time co-editing.
- Billing, paid plans, and self-serve quota upgrades.
- Admin reading content, impersonating Users, deleting Users, audit logs, and analytics charts.
- CoreEx sending emails (Invite emails, notifications). Supabase's own auth emails (confirmation, password reset) are used as-is.
- Asset types beyond PNG, JPG, WebP, GIF, and PDF (no SVG, Office documents, audio, or video). Note version history. Export. Offline or mobile apps. Templates. A `/` command menu. Drag-and-drop blocks.
- Folder sharing, and an Item living in more than one Folder.

## Further Notes

These decisions were made while writing this spec, not during the grilling session, so review them:

1. **Link storage format** `[[id|title]]` with title-based resolution on save. This keeps Links rename-safe while leaving the Markdown readable.
2. **Trashed Assets still count toward the Storage Quota** until purged, so "Delete forever" and "Empty Trash" exist to free space immediately.
3. **Version-checked autosave** (409 on conflict) instead of last-write-wins. It's cheap now and important once MCP agents edit Notes in V1.5.
4. **The Invite gate is enforced in the backend**, not by closing Supabase sign-up. Strangers can create a bare Supabase Auth account but get nothing from CoreEx. This avoids depending on Supabase-specific hooks.
5. **`simple` text-search configuration** (no English stemming), so mixed English and Malay content is searched fairly. The cost is that "running" won't match "run".
6. **Another User's resources return 404, not 403**, so the API never confirms that an id exists.
