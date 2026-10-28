# Markdown is the storage format for Notes

A Note's content is stored as plain Markdown text and edited in a live-preview Markdown editor (Obsidian/Typora style), not as Notion-style block JSON. We chose this because V1.5's MCP access lets AI tools read and write Notes, and they speak Markdown natively — block JSON would need a lossless two-way converter on every MCP call. It also makes Import trivial (an uploaded `.md` *is* a Note), Link parsing a text scan, later search/RAG work on plain text, and full data export a zip of `.md` files.

## Consequences

- No drag-and-drop blocks in the editor; a `/` command menu can still be added on top of Markdown later.
- The editor library must support live-preview Markdown with custom `[[...]]` Link syntax.
