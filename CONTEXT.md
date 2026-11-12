# CoreEx

A personal knowledge base where a user writes, uploads, and connects their own knowledge, and (later) lets AI tools work with it.

## Language

### Content

**Item**:
Anything a user keeps in CoreEx — either a Note or an Asset. Items are independent and equal; neither depends on the other to exist.
_Avoid_: Entry, object, record, document

**Note**:
An Item whose content is Markdown text written or edited by the user.
_Avoid_: Page, doc, post

**Asset**:
An Item whose content is an uploaded binary file (an image or a PDF). It stands on its own; it is not owned by a Note. Assets are sources rather than knowledge: they are the origin material for Notes, and the future text extraction and image analysis read them. They have their own place in the app (the Assets module), though for now they can still be put in Folders, tagged and linked like any Item.
_Avoid_: File, attachment, upload, media

**Import**:
Turning an uploaded Markdown or plain-text file into a new Note. The original file is not kept.
_Avoid_: Upload (when the result is a Note)

### Organization

**Tag**:
A user-defined label that can be put on any Item to group it with other Items of the same kind. An Item can have many Tags. Each Tag has a **Tag colour**.
_Avoid_: Label, category

**Tag colour**:
One of a fixed set of named colours (such as teal or pink) that a User picks for a Tag so it is easy to recognize. A Tag whose User has not picked one still shows a colour chosen from its name.
_Avoid_: Tag label colour, hex colour

**Link**:
A reference written inside a Note's text (as `[[Item title]]`) that points to another Item — a Note or an Asset. Only Notes contain Links; any Item can be the target of one. A Link keeps pointing at the same Item when that Item is renamed.
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
Finding Notes by what they mean, not only by the words they contain, so a search for "car" can find a Note about an automobile. It sits beside exact-word search, and the Search page shows both as one list.
_Avoid_: Vector search, AI search, smart search

**Chunk**:
A piece of a Note, about 250 words, cut at headings and whole paragraphs, that Semantic search matches and shows as the snippet. A short Note is one Chunk.
_Avoid_: Segment, passage, fragment, block

### Chat

**Chat**:
A saved back-and-forth in which a User asks a model questions or for work, and the model can read that User's Items to answer, showing the Notes it read as sources. It is kept until the User deletes it, does not go through the Trash, and is not an Item. It is also the name of the module.
_Avoid_: Conversation, thread, assistant, bot, AI search

**Shared key**:
The model provider key CoreEx pays for, which every User's Chats use. An Admin can turn it off at any time.
_Avoid_: Platform key, default key

**Daily Chat budget**:
How much of the Shared key's cost one User may use in a day, counted in money rather than words. It starts again each day at midnight UTC.
_Avoid_: Quota (that is the Storage Quota), credits, token limit

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
