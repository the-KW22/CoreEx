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
An Item whose content is an uploaded binary file (an image or a PDF). It stands on its own; it is not owned by a Note.
_Avoid_: File, attachment, upload, media

**Import**:
Turning an uploaded Markdown or plain-text file into a new Note. The original file is not kept.
_Avoid_: Upload (when the result is a Note)

### Organization

**Tag**:
A user-defined label that can be put on any Item to group it with other Items of the same kind. An Item can have many Tags.
_Avoid_: Label, category

**Link**:
A reference written inside a Note's text (as `[[Item title]]`) that points to another Item — a Note or an Asset. Only Notes contain Links; any Item can be the target of one. A Link keeps pointing at the same Item when that Item is renamed.
_Avoid_: Reference, connection, relation, wikilink

**Backlink**:
A Link seen from the target's side — the list of Notes that link to a given Item.
_Avoid_: Inbound link, mention, reference

**Folder**:
A container that holds Items and other Folders, forming a tree. Each Item lives in at most one Folder; an Item in no Folder sits at the top level.
_Avoid_: Directory, collection, space, notebook

**Trash**:
Where deleted Items and Folders wait for 30 days before being permanently removed. Anything in the Trash can be restored until then.
_Avoid_: Bin, archive, recycle bin

### People

**User**:
A person with a CoreEx account. A User owns all of their Items, Folders, and Tags, and nothing they own is visible to anyone else.
_Avoid_: Account, member, customer, owner
