# CoreEx

A personal knowledge base where a user writes, uploads, and connects their own knowledge, and (later) lets AI tools work with it.

## Language

### Content

**Item**:
Anything a user keeps in CoreEx: a Note, an Asset, or one of the Career Items (a Resume, a Cover Letter or an Application). Items are independent and equal; none depends on another to exist.
_Avoid_: Entry, object, record, document

**Note**:
An Item whose content is Markdown text written or edited by the user. A Note can be marked as a **Story**.
_Avoid_: Page, doc, post

**Asset**:
An Item whose content is an uploaded binary file (an image or a PDF). It stands on its own; it is not owned by a Note. Assets are sources rather than knowledge: they are the origin material for Notes, and the future text extraction and image analysis read them. They have their own place in the app (the Assets module), though for now they can still be put in Folders, tagged and linked like any Item.
_Avoid_: File, attachment, upload, media

**Import**:
Turning an uploaded Markdown or plain-text file into a new Note. The original file is not kept.
_Avoid_: Upload (when the result is a Note)

**Note version**:
The text a Note had before a save replaced it, kept so the User can read it in the Note's History and bring it back with Restore. An Agent's edit and a Restore always keep the text they replace; the User's own saves close together keep one. A Note keeps its newest 50 versions, for up to 90 days, and they leave with the Note when the Trash removes it. Not the same as the Note's save counter, which only stops two saves from overwriting each other.
_Avoid_: Revision, snapshot, backup

### Organization

**Tag**:
A user-defined label that can be put on any Item to group it with other Items of the same kind. An Item can have many Tags. Each Tag has a **Tag colour**.
_Avoid_: Label, category

**Tag colour**:
One of a fixed set of named colours (such as teal or pink) that a User picks for a Tag so it is easy to recognize. A Tag whose User has not picked one still shows a colour chosen from its name.
_Avoid_: Tag label colour, hex colour

**Link**:
A reference written inside a Note's text (as `[[Item title]]`) that points to another Item of any type. Only Notes contain Links (not Resumes or Cover Letters, which are printed for others); any Item can be the target of one. A Link keeps pointing at the same Item when that Item is renamed.
_Avoid_: Reference, connection, relation, wikilink

**Backlink**:
A Link seen from the target's side — the list of Notes that link to a given Item.
_Avoid_: Inbound link, mention, reference

**Suggested Link**:
Two Notes that are close in meaning and have no Link between them, offered as a Link worth making. It is not a Link until the User or an Agent makes one: it is never stored and never shows in Backlinks.
_Avoid_: Similar edge, recommended link, auto-link

**Graph layout**:
Where a User left the nodes of one graph in the Graph module: each Folder's graph, and the All Items graph, keeps its own. A node keeps its place until the User drags it again or chooses Reset layout.
_Avoid_: Graph positions, node layout, saved view

**Folder**:
A container that holds Items and other Folders, forming a tree. Each Item lives in at most one Folder; an Item in no Folder sits at the top level.
_Avoid_: Directory, collection, space, notebook

**Trash**:
Where deleted Items and Folders wait for 30 days before being permanently removed. Anything in the Trash can be restored until then. Text a saved Chat already quoted from a Note stays in that Chat until the Chat is deleted.
_Avoid_: Bin, archive, recycle bin

### Search

**Semantic search**:
Finding Notes, Applications and Resumes by what they mean, not only by the words they contain, so a search for "car" can find a Note about an automobile. It sits beside exact-word search, and the Search page shows both as one list.
_Avoid_: Vector search, AI search, smart search

**Chunk**:
A piece of a Note, about 250 words, cut at headings and whole paragraphs, that Semantic search matches and shows as the snippet. A short Note is one Chunk. Applications and Resumes are cut the same way from their plain text.
_Avoid_: Segment, passage, fragment, block

### Chat

**Chat**:
A saved back-and-forth in which a User asks a model questions or for work, and the model can read that User's Items to answer, showing the Notes it read as sources. It is kept until the User deletes it, does not go through the Trash, and is not an Item. It is also the name of the module.
_Avoid_: Conversation, thread, assistant, bot, AI search

**Shared key**:
The model provider key CoreEx pays for, which every User's Chats use. An Admin can turn it off at any time.
_Avoid_: Platform key, default key

**Daily Chat budget**:
How much of the Shared key's cost one User may use in a day, counted in money rather than words. Chats and every Career AI action, such as filling in an Application from a posting, draw on the same budget. It starts again each day at midnight UTC.
_Avoid_: Quota (that is the Storage Quota), credits, token limit

### Career

**Career**:
The module for a User's job search: Applications, Resumes, Cover Letters, Knowledge, Offers and Today. Resumes, Cover Letters and Applications are Items with their own pages here; they can still sit in Folders, take Tags and go to the Trash like any Item.
_Avoid_: Jobs, documents, job tracker (for the whole module)

**Application**:
An Item that tracks one job the User is interested in or has applied for: company, role, the posting, its Stage, a timeline of what happened, interviews and one follow-up reminder. Its title is "Role at Company" until the User renames it. The workspace of Career results for that job hangs off it.
_Avoid_: Job, opportunity, lead, posting (the posting is the employer's text inside it)

**Stage**:
Where an Application stands, one of a fixed six: Saved, Applied, Screening, Interview, Offer, Closed. A Closed Application records why (accepted, not selected, withdrew, accepted another offer, no response). Every change of Stage is kept in the Application's timeline, which also holds notes and "I followed up" and "They replied" lines. Entries can be back-dated, never into the future. The no-reply clock starts at the applied date and restarts at each follow-up or reply. An interview is a timeline entry with a start time, a type and notes, and counts as ended an hour after it starts. A posting is tracked once: two links with the same canonical address (the job-id parameters only) are the same posting. An Application has at most one follow-up reminder (a date and an optional time; a date alone is 09:00 in the User's timezone), which "I followed up" clears.
_Avoid_: Status, lane, column, step

**Next step**:
The one thing an Application needs from the User now, worked out from its Stage, interviews, follow-up reminder and how long it has been silent (an Applied Application with no reply for 10 days needs a follow-up). An upcoming interview is due from 24 hours before it starts. Today's "Needs you" is the Applications whose Next step is due.
_Avoid_: Task, to-do, action item

**Resume**:
An Item holding a User's resume: its content (contact details, sections and entries) and its design (template, fonts, colours, layout) together, printed to PDF. A Resume is tailored to one Application and linked to it; the version sent to an employer is kept unchanged. A Resume is made from a CV by copying it.
_Avoid_: document, profile

**CV**:
The User's master Resume: complete, kept up to date and never linked to an Application. It is a Resume of kind CV (ADR 0014), so it has the same content, design, editor and PDF; the User may keep several. **New Resume from CV** copies it into a Resume for one Application.
_Avoid_: master Resume (in the UI)

**Cover Letter**:
An Item holding a letter to one employer, with its recipient, greeting, body and sign-off. Its sender details and design come from a Resume while the two stay linked; unlinking keeps an editable copy.
_Avoid_: Letter (alone, in code), motivation letter, document

**Fact**:
One short statement about the User's experience that the User has confirmed, kept with the exact words it came from (a Resume, a Note, a Chat, or typed by hand). Facts, Stories and the User's Resumes and Cover Letters are the only evidence Career's AI may state as the User's experience. A Fact can be switched off for AI, or forgotten so nothing can bring it back. Facts are not Items.
_Avoid_: Memory, claim, achievement, note

**Story**:
A Note marked as a Story: one experience told as Situation, Task, Action, Result and Reflection, used as evidence for interviews and applications. It stays a normal Note with Links, Search and versions.
_Avoid_: STAR answer, example, anecdote

**Career result**:
Something Career's AI made for one Application from its evidence: a Fit check, an interview briefing, practice feedback, a debrief, a draft email, or a reply read from an employer's message. It belongs to its Application, leaves with it, and is marked out of date when the posting, the Facts, the Stories or the linked Resume or Cover Letter change after it was made. It is not an Item.
_Avoid_: Artifact, output, saved item, generation

**Form question**:
One question on an employer's application form, kept on its Application with the User's answer and an optional limit in words or characters. The count follows the limit's unit, ignores spaces at the ends and counts an emoji as one character. A Draft or a Tighten is a Career result that waits until the User accepts or rejects it; accepting writes it as the answer.
_Avoid_: Screening question, prompt, field

**Answer library**:
Reviewed answers the User keeps to use again: reusable, for one employer only, or for one job only. Matching a Form question to a kept answer uses words alone, never AI. Reusing one makes an independent copy: editing the copy never changes the library.
_Avoid_: Saved answers bank, template, snippet

**Application email**:
A Career result drafting an email for one Application: the email that sends the Resume and Cover Letter, a follow-up, a thank-you after an interview, or a reply to the employer. CoreEx never sends it: the User copies it or opens it in their own mail app, with the exact PDFs to attach.
_Avoid_: Message (alone), outreach, template

**Offer**:
The terms an employer offered for an Application (pay, currency, period, bonus, start and reply dates), with unknown terms left empty rather than zero. Editing terms keeps the earlier version, and two Offers are compared only in the same currency and pay period.
_Avoid_: Package, compensation (alone), deal

### People

**User**:
A person with a CoreEx account. A User owns all of their Items, Folders, and Tags, and nothing they own is visible to anyone else.
_Avoid_: Account, member, customer, owner

**Admin**:
A User who can also manage Invites, see Users and their storage use, change a User's Storage Quota, and disable Users. An Admin can never read another User's Items.
_Avoid_: Superuser, moderator, operator

**Access token**:
A secret a User creates so an Agent can act for them on the MCP server (`/mcp`). It carries the User's full access, can be revoked at any time, and expires (90 days unless chosen otherwise). It is shown once, when created. It works nowhere except `/mcp`.
_Avoid_: API key, password, personal access token (outside this definition)

**Agent**:
An AI client, such as Claude Code or Codex, that works with a User's knowledge base through an Access token. An Agent can do what the User can, except remove anything for good.
_Avoid_: Bot, assistant, integration, client

**Invite**:
Permission for one email address to create a CoreEx account. Sign-up is only possible with an Invite.
_Avoid_: Allowlist entry, whitelist, access code

**Disabled User**:
A User who can no longer log in, but whose Items, Folders, and Tags are kept intact.
_Avoid_: Banned, suspended, deleted, deactivated

**Storage Quota**:
The maximum total size of all Assets a single User may keep.
_Avoid_: Storage limit, allowance, cap

**Export**:
One zip a User downloads with everything they keep: their Notes as Markdown files, their Assets as the files they uploaded, in folders that mirror their Folders, and a manifest that lists every Item and anything that could not be included. It leaves out the Trash and Chats, and holds nothing of any other User, an Admin's included. A User may make one a minute.
_Avoid_: Backup, dump, download all, archive
