# A CV is a kind of Resume, not a new Item type

The owner keeps a **CV** (one complete master document) and sends **Resumes** tailored to one employer each. A CV is stored as a Resume with `kind = CV` (a column on `resume_contents`, default `RESUME`). It is not a sixth Item type.

## Why

A CV has the same content and the same design as a Resume: the same JSON document, the same editor, templates, PDF, Check, versions, Trash and Export. A separate Item type would need its own table, endpoints, MCP tools, Search and Graph rows and a second editor for no difference in behaviour. The only rules that differ are two: a CV is never linked to an Application, and a Resume is made from a CV by copying it.

## Rules

- A CV cannot be linked to an Application. The API refuses it (`INVALID_REQUEST`), and the Application's Resume picker lists Resumes only.
- **New Resume from CV** copies the CV (content and design) into a new Resume (kind `RESUME`). The copy is independent afterwards; the version sent to an employer stays unchanged, as before.
- Several CVs are allowed (for example a short and a long one). Nothing needs a limit.
- Existing Resumes stay Resumes: the migration adds the column with the default `RESUME`.
- Row level security and User scoping do not change (ADR 0001 and 0005): the column lives on an existing table.

## Consequences

- The Resume API (`kind` on responses, an optional `kind` on create and as a list filter) and the MCP tools show the kind. Search and the Graph still show a CV as a Resume, because they work from the Item type; add the kind to those rows if it ever matters there.
- `CONTEXT.md` defines **CV** and no longer says to avoid the word in the UI.

## Considered options

- **A new Item type `CV`:** rejected for the reasons above.
- **A flag on the Application link only:** rejected; the User needs a CV with no Application, and the CV is listed on its own page.
