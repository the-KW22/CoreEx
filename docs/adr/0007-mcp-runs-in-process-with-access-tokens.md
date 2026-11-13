# The MCP server runs inside the API and authenticates Agents with Access tokens

CoreEx's MCP server (V1.5, issue #112) lives in the Spring Boot backend at `/mcp`, and its tools call the same service classes the REST controllers use, never repositories. This keeps every rule where it already is (User scoping from ADR 0001, quotas, version-checked saves, the Trash) with no second place to enforce it. It refines ADR 0003's "the frontend calls only the REST API" and the V1 spec's "MCP is just another API client": MCP is a second front door to the same services, not a separate process calling the REST API.

An Agent signs in with an **Access token**, not a Supabase session. A token is `cx_pat_` plus 32 random bytes, shown once and stored only as a SHA-256 hash in `coreex.access_tokens` (with row level security, ADR 0005). It carries the User's full access, expires (90 days by default), can be revoked, and is limited to 60 calls a minute. It is accepted only on `/mcp`, through its own security filter chain, and the rest of the API keeps accepting only Supabase tokens, so a leaked token reaches only what the MCP tools allow. Disabled Users' tokens are refused, and Admins cannot see tokens (ADR 0004).

Agents never remove anything for good: the tools can move to the Trash and restore, but never delete forever, empty the Trash, or delete a Tag (Tags have no Trash).

**Asset files (amended for issue #207).** The first version gave Agents no way to read or add an Asset's file. Now they can, only through short-lived links: `start_upload` and `confirm_upload` reuse the web app's upload flow (the Agent PUTs the file to a presigned link itself), and `get_asset_url` returns the existing 5-minute download link. Every rule of `AssetService` still applies (type list, size limit, quota, ownership), the stored file is checked on confirm, and the REST API still refuses Access tokens. The file never travels inside a tool call: a tool argument is written out by the model, so base64 would make it type a 1 MB image as 1.3 million characters, which is slow, costly and fragile. The price is that only an Agent that can run a command or make a web request can use these tools, and a link works for whoever holds it until it expires, which the tool descriptions say.

## Considered Options

- **A separate MCP service calling the REST API** — matches "just another client" literally, but means a second free-tier service with its own cold start and deploy, an extra network hop per tool call, and a second place for token handling. Rejected: the rules already live in the service layer.
- **OAuth 2.1 with consent screens** (needed for claude.ai and ChatGPT connectors) — a much larger build. Deferred, not rejected: it would add a second way to obtain a token without changing the server.
- **Read-only and read/write token scopes** — rejected for now; a single full-access token is simpler, and the damage an Agent can do is bounded by the tools (nothing permanent).
- **The rate limit is in memory** — fine for one API instance; the code carries a `shortcut:` note to move it when there are several.
