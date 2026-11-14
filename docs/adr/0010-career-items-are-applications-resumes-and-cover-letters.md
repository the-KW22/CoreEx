# Applications, Resumes and Cover Letters are Items in a Career module

CoreEx gets a **Career** module for the job search, modelled on Reactive Resume (MIT). Its three kinds of record, **Application**, **Resume** and **Cover Letter**, are new Item types beside Note and Asset. Each has its own pages in Career, the way Assets have the Assets module, but they behave like every Item: they can sit in a Folder, take Tags and Tag colours, go to the Trash for 30 days, be the target of a Link, show in the Graph, Search, Semantic search and Chat, go into the Export zip, and be read and changed by Agents on `/mcp`. Only Notes contain Links; a Resume or Cover Letter is printed for strangers, so it never holds `[[...]]` text.

The owner wants one place for everything they keep, so a resume should be findable, linkable from a Note about a project, and filed beside the Notes for a job hunt. Assets already showed that an Item can have a module of its own without leaving Folders and Tags.

Everything else Career makes is not an Item. **Facts** are their own records, **Stories** are Notes marked as a Story, and **Career results** (Fit checks, briefings, drafted emails and so on) and **Offers** belong to their Application and leave with it.

Sharing is out: no public resume pages, feedback links or view counts. ADR 0001 stays as it is.

The order of work is the Applications tracker first (#223), then Resumes and Cover Letters (#224), then the Career features (#225).

## Considered Options

- **A separate module whose records are not Items** (like Chat): simpler, since Folders, Links, Graph, Search and Export need no new types. Rejected by the owner, who wants Career records filed and found with everything else.
- **Public resume pages and feedback links** (as Reactive Resume has): rejected for now. They would be the first User content visible to others and would need ADR 0001 amended.

## Consequences

- Every Item feature (Folders, Tags, Trash, Links, Graph, Search, Semantic search, Chat sources, Export, MCP) needs a case for each new type. Each epic carries those tickets.
- Search, Semantic search and Chat read text, so each new type needs a plain-text version of itself, made by the backend on save.
- An Item's title must exist for Links: an Application is "Role at Company" until renamed; Resumes and Cover Letters have the name the User gives them.
- A Resume's photo is an Asset, so it counts against the Storage Quota and can be reused.
- Decision records with every choice and the reasons are in `docs/career/`.
