# Resume and Cover Letter text is HTML, edited with Tiptap

A Resume or Cover Letter is stored as **one JSON document** per Item: contact details, sections, entries and design together, defined as Java records in the backend and published through OpenAPI (ADR 0003), so the frontend gets its types from the generated client. Inside it, rich-text fields (the summary, each entry's description, the letter body) are **HTML**, edited with **Tiptap**. This differs on purpose from Notes, which are Markdown (ADR 0002).

The owner chose HTML to match Reactive Resume and to allow formatting Markdown cannot hold, such as underline, colour, highlight and alignment, with a word-processor style editor that people writing a resume expect.

## Considered Options

- **A Markdown subset** (bold, italic, links, lists) edited with the existing CodeMirror editor: recommended in the grilling because Search, Semantic search, Chat, Export and Agents already speak Markdown, and it needs no sanitiser. Rejected by the owner.
- **Tiptap with Markdown storage**: keeps a word-processor editor but loses the extra formatting. Not chosen.
- **Fully relational tables** for sections and entries: rejected; versions, import, export and whole-document saves are much simpler with one document.

## Consequences

- **Every write is sanitised on the backend** against an allowlist of the marks Tiptap may produce, whatever sent it: the editor, an import, or an Agent. Rendering never trusts stored HTML.
- **The backend makes plain text from the HTML on save**, for Search, Chunks and Chat, and a Markdown view for Agents and the Markdown download. One converter, kept in the backend.
- Agents change a Resume with JSON Patch against the expected save counter (the same check that stops two Note saves overwriting each other), writing HTML that is sanitised the same way; each Agent edit keeps a version.
- The PDF and DOCX renderers parse HTML into text runs.
- CoreEx now has two editors (CodeMirror for Notes, Tiptap for Career) and two text formats. A Story is a Note, so it stays Markdown.
