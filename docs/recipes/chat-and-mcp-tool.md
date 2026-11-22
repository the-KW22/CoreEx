# Chat and MCP tool recipe

Read tools are defined once, for both front doors (ADR 0007). `/mcp` gets them from the MCP starter; Chat gets them from `ToolCatalogue` (`com.coreex.mcp`), which finds every `@McpTool` method marked `readOnlyHint`. A write tool is not in Chat at all until Proposals (#199).

## Add a read tool

1. Write an `@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "...", description = "...")` method in the feature's `*Tools` class in `backend/.../mcp/`. Take `McpTransportContext context` first, get the caller with `McpConfig.agent(context).user()`, and call the feature's service, never a repository. Parameters are `@McpToolParam`; they must be simple types (String, UUID, Integer, Boolean or an enum).
2. It appears in `/mcp` and in Chat with no other change. The input schema comes from the parameters; the context is not part of it.
3. Update `frontend/lib/mcp-tools.ts` in the same change (name, group, read or change kind, summary, "Use it when"), as `docs/agents/skills-playbook.md` says. `McpDocsTest` fails until the guide matches the server.

## Add a write tool

Mark it without `readOnlyHint` (as the existing writes do). It is then on `/mcp` only. Chat does not offer it, and `ChatToolbox` refuses it if a model asks for it anyway.

## Keep a read tool out of Chat

`ChatToolbox` filters the catalogue by name in its constructor; `list_trash` is excluded there. Add the name to that filter.

## Chat's own search

`search` in Chat is not the MCP `search`. `ChatToolbox` offers its own `search` (query only), which returns up to 8 pieces of Notes, Applications and Resumes by meaning: `SearchService.chunks` gives each Item's closest Chunk above `coreex.embeddings.search.min-similarity`, and when that finds nothing, the exact-word hits from `SearchService.search` are returned with `headingPath` null and `similarity` 0. Its result is `{"chunks": [...]}`, with each piece's `id` (an Item id, for `get_item`), `title`, `headingPath`, `text` and `similarity`.

## Limits

- Every tool result is cut at `coreex.chat.max-tool-result-characters` (default 60000) and ends with `…(cut: result too long, narrow your request)`.
- A tool throwing `ApiException` sends its message to the model as an error result. Any other exception sends `The tool failed.`, so no stack trace reaches the model.

## Test

- Through the Chat API with a scripted model: `ChatToolsApiTest` (offered tools, refusal of writes and the Trash, ownership, the search fallback) and `ChatToolResultCapApiTest` (the cap). Script a tool call with `TestModel.toolUse(name, json)`, then read the stored `tool_result` blocks.
- MCP behaviour: the existing `Mcp*Test` classes, which must stay green. Do not import `ScriptedChatTools` into a test that needs the real `ChatToolbox`; it is `@Primary` and would replace it.
