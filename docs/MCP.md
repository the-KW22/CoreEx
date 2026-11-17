# Connecting an Agent to CoreEx (MCP)

CoreEx has an MCP server (Model Context Protocol) at `/mcp`. It lets an **Agent** (an AI tool such as Claude Code, Codex or Claude Desktop) read, write and organise your knowledge base as you. It signs in with an **Access token** that you create in CoreEx. The design is in [ADR 0007](adr/0007-mcp-runs-in-process-with-access-tokens.md).

The guide for Users is in the app: **Connect an Agent** in the Account menu, at `/docs/mcp`. It covers the Quick start, the commands for each client, the tools, security, limits and troubleshooting, and it shows the address of the installation you are signed in to. Do not copy tool lists here: the in-app guide's data file, `frontend/lib/mcp-tools.ts`, is the one list, and `McpDocsTest` fails when it differs from the server. See [DESIGN.md](DESIGN.md) section 6.11a for how the guide is built.

## The address

| Where | Address |
|---|---|
| Production | `https://coreex-api-prod.onrender.com/mcp` (your Render backend, plus `/mcp`) |
| Local development | `http://localhost:8080/mcp` |

The free Render plan can be asleep: the first call after a long quiet time may take a minute or more (see [DEPLOY.md](DEPLOY.md)).
