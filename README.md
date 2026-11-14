# CoreEx

A personal knowledge base: write Markdown Notes, upload Assets, organize them with Folders and Tags, and connect them with Links. Terms are defined in [CONTEXT.md](CONTEXT.md), decisions in [docs/adr/](docs/adr/), and how we work in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

| Folder | What |
|---|---|
| `backend/` | Spring Boot REST API (Java 21, Maven). Owns all business rules and the database. |
| `frontend/` | Next.js UI (TypeScript). Calls only the API, through a client generated from its OpenAPI spec. |
| `supabase/` | Local Supabase config (Postgres, Auth, Storage in Docker). |

## Prerequisites

JDK 21, Node.js 24, Docker Desktop (running), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

## Run locally

1. **Start local Supabase** (first run downloads images):

   ```bash
   supabase start
   ```

   Stop it with `supabase stop`. Postgres listens on `localhost:54322`. `supabase status` shows the local API URL and keys.

2. **Start the backend** (port 8080). Copy `backend/.env.example` to `backend/.env`, set `OWNER_EMAIL` to the email you will sign up with, load those variables into your shell, then run:

   ```bash
   cd backend
   ./mvnw spring-boot:run
   ```

   Flyway migrates the database on start. Check it: <http://localhost:8080/api/health> and the spec at <http://localhost:8080/v3/api-docs>.

3. **Start the frontend** (port 3000). Copy `frontend/.env.example` to `frontend/.env.local` and put the Publishable key from `supabase status` in `SUPABASE_PUBLISHABLE_KEY`, then:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Sign in.** Open <http://localhost:3000>, choose **Create account** with the `OWNER_EMAIL` address, and you land in the app as Admin. Sign-in is email and password only for now. **Forgot password?** on the sign-in page emails a reset link (locally it lands in Mailpit at <http://127.0.0.1:54324>; production setup is in `docs/DEPLOY.md`).

CoreEx's tables live in the `coreex` schema (ADR 0005). If you ran an older version, `public.users` and `public.invites` are unused leftovers; `supabase db reset` clears them.

### Inviting someone

CoreEx is invite-only. Sign in as the owner (`OWNER_EMAIL`), open **Admin** in the sidebar, enter the person's email and select **Create Invite**. Use **Copy sign-up link** and send it to them; the link opens the sign-up page with their email filled in. An Invite can be revoked while it is pending. Without a pending Invite a person sees the "invite-only" screen.

Disable, enable and remove Users in Admin > Users.

### Writing Notes

The home page lists your Items, newest first. **New Note** opens an editor where Markdown renders as you type (headings, emphasis, lists, checkboxes, code); the markup shows on the line your cursor is on. The Note saves by itself about a second after you stop typing. If it was changed somewhere else in the meantime, the editor offers to reload that version or overwrite it with yours. **Move to Trash** hides the Note; the Trash screen itself comes later.

### Folders

The sidebar shows your Folders as a tree; use the arrow to collapse one. Type a name under **Folders** to add a top-level Folder. A Folder's page lists its subfolders and Items, and lets you create a Note or subfolder there, rename it, move it (a Folder cannot go into itself or its own subfolders), or move it to the Trash. The Trash confirmation says how many Folders and Items go with it. To file a Note, use the **Folder** menu on its page; **Top level** takes it out of any Folder.

### Tags

On a Note's page, type a name under **Add a Tag**; your existing Tags are suggested as you type, and a new name creates a Tag. `Research` and `research` are the same Tag, shown with the casing it was first typed in. **×** takes a Tag off one Note. **Tags** in the sidebar lists every Tag with how many live Items use it; a Tag's page lists those Items and lets you rename it (to a name you already have is refused) or delete it from all Items at once. The Items themselves are never touched.

### Links and Backlinks

In a Note, type `[[` and your Items are suggested by title, with their type and Folder; choosing one inserts a Link. Links show the target's current title, so they keep working after a rename or a move, and clicking one opens it. You can also type `[[Exact Title]]`: when exactly one of your Items has that title, the next save turns it into a Link; with no match, several matches, or an Item in the Trash it stays as written and is shown as an unresolved Link (dashed). Links inside code are left alone. Under every Note, **Backlinks** lists the Notes that link to it. The text of a Link is stored as `[[<item-id>|<title>]]`, which is plain Markdown. Click into the editor to edit a Link's raw text on its line.

### Assets

On the home page or a Folder's page, drop images or PDFs (PNG, JPG, WebP, GIF, PDF; up to 5 MB each) on the upload box or choose them. The title starts as the file name. An Asset's page shows an image inline or a PDF in the viewer, offers **Download**, lets you rename it and add a description, and works like a Note for Folders, Tags, Links and Backlinks (`[[` suggests Assets too). **Move to Trash** hides it, but its file still counts toward your storage (100 MB by default) until the Trash is emptied. The home page shows how much you have used.

Files live in a private Supabase Storage bucket. The browser uploads straight to Storage with a short-lived link from the API, and the API checks the stored file's real size and type before creating the Asset. To use Assets locally, `supabase start` creates the `assets` bucket from `supabase/config.toml`, and `backend/.env` needs `STORAGE_URL`, `STORAGE_SERVICE_KEY` and `STORAGE_BUCKET` (see `backend/.env.example`). Without them everything else works and Asset endpoints answer 503. Production setup is in `docs/DEPLOY.md`.

### Admin: Users and Overview

Next to **Invites**, the Admin area has **Users** and **Overview** (visible to Admins only). Users lists every account with its status, sign-up date, last active time, number of Items and storage used against its quota. You can change a User's quota in megabytes (or go back to the default), and Disable or Enable the account: a disabled User is refused on their very next request, nothing they own is touched, and enabling restores everything. You cannot disable yourself. **Remove…** (with a confirmation) deletes a person's Notes, files and Supabase sign-in for good so their email can be invited again; it needs `STORAGE_SERVICE_KEY` (and Storage's URL) on the backend, is safe to retry if a step fails (the person stays disabled meanwhile), and is not offered for Admins. Delete people here, not in Supabase Authentication, or their CoreEx account stays behind. Overview shows the number of Users and the total storage used against the hosting limit (1 GB on the Supabase free tier, `coreex.admin.hosting-limit-bytes`). These screens show account facts and totals only, never anyone's Notes, Assets or Folders (ADR 0004).

### Importing Markdown and text files

The same box on the home page and a Folder's page also takes `.md` and `.txt` files: each becomes a new Note, titled after the file name without its extension, with the file's text stored exactly as written. Several files can be added at once, and a bad file (another type, over 1 MB, or not valid UTF-8) is refused on its own with a message while the rest are imported. `[[Exact Title]]` in an imported file becomes a Link under the same rules as when you write it, including links between files imported together. On a Folder's page the Notes land in that Folder. The original file is not kept.

### Search and the quick switcher

**Search** in the sidebar (or `/search`) finds your Items by Note title and text, Asset title and description, and Tag name. Words are matched exactly as written, ignoring case, in any language (Malay, French, ...; accents count, so `cafe` does not find `café`). A file name such as `Q3_report-final.v2.pdf` is found by its words. Use `"quotes"` for a phrase, `or` for either word and `-word` to leave one out. Narrow results by type, Folder (subfolders included) and Tag; each result shows a snippet with the matches highlighted, and trashed Items never appear. Only the first 200,000 characters of a Note are searched.

Press **Ctrl+K** (**Cmd+K** on a Mac) on any page to open the quick switcher: type part of a title (a typo is fine) and press Enter to open it; with nothing typed it lists the Items you opened most recently.

### Trash

**Move to Trash** (on a Note, Asset or Folder) hides it; **Trash** in the sidebar lists what is there with the days left before it is removed for good (30). A deleted Folder is one row ("with 2 Folders and 5 Items"). **Restore** brings an Item back together with any trashed Folders above it (not what else was in them), and brings a Folder back with exactly what was deleted with it. Links to a restored Item work again. **Delete forever** and **Empty Trash** remove things for good, including the files in Storage, which frees your storage quota. Anything older than 30 days is removed by a background job every 6 hours while the app is awake, and by a daily scheduled GitHub Actions run that also wakes the free host (setup in `docs/DEPLOY.md`).

### Applications (first part of Career)

**Career** in the sidebar opens the Applications list, newest first, with a panel beside the rail. **New Application** there takes a company, a role and the pasted posting, and opens the Application's page: its fields, a stepper through the six Stages (Saved, Applied, Screening, Interview, Offer, Closed) and a timeline of every move. The title is "Role at Company" until you rename it. The first move into Applied sets the applied date. Applications also show in All Items; Trash, Folders, Tags and Search for them come in later Career tickets (#223).

### Access tokens

**Access tokens** in the Account menu (bottom of the sidebar) creates the secret an Agent such as Claude Code or Codex uses to work with your knowledge base. Give it a name and an expiry (90 days unless you choose otherwise, or never), then copy it from the dialog: it is shown once, and only a hash of it is stored. **Revoke** stops it at once. Up to 10 tokens can be live at a time, and each is limited to 60 calls a minute (`coreex.tokens.*`). An Access token works only on the MCP server at `/mcp`, never on the rest of the API, and stops working if your account is disabled.

### MCP server

The API also speaks MCP (Model Context Protocol) at `/mcp`, so an Agent (Claude Code, Codex, Claude Desktop) can read, write and organise your knowledge base with an Access token. It can never delete anything for good: the Trash is as far as it goes. A Note or Asset an Agent last changed shows **Edited by** in its Details panel. In the app, **Connect an Agent** in the Account menu opens a guide with the tools, how to connect each tool and what to watch out for; [docs/MCP.md](docs/MCP.md) is the same for readers of the repository.

## Deploying

Production (from `main`) is the only cloud environment: a Vercel frontend, a Render backend and one Supabase project. `staging` is the integration branch, checked by CI and by running the stack locally. See [docs/DEPLOY.md](docs/DEPLOY.md) for setup, variables and redeploying.

## API client

The frontend client types are generated from `backend/openapi.json`. After changing the API, run the backend tests (they rewrite the spec), then regenerate the client and commit both:

```bash
cd backend && ./mvnw test
cd ../frontend && npm run generate
```

Never edit `frontend/lib/api/schema.d.ts` by hand.

## Tests

```bash
cd backend
./mvnw test
```

API tests start the real app against a Testcontainers Postgres, so Docker must be running. They do not touch local Supabase.

Frontend checks: `npm run typecheck`, `npm run lint`, `npm run build` (in `frontend/`).

## Configuration

**Hosted Supabase projects (staging, production) must have "Confirm email" turned on** (Authentication > Providers > Email). The API trusts the token's email to recognise the owner and Invites, so without confirmation someone could sign up with an invited address before its owner does. Local Supabase has it off for convenience.

No secrets are committed. Each app has an `.env.example` listing its variables. The local Supabase values in `backend/.env.example` are the fixed, public defaults of `supabase start`.
