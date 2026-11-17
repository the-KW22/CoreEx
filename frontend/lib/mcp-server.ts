// This installation's MCP server address, read on the server from API_URL (the same value the API client uses), and
// the placeholder every command in the docs uses for the token. The docs never show a real token.
export const MCP_TOKEN_PLACEHOLDER = "cx_pat_YOUR_TOKEN";

export function mcpServerAddress(): string {
  return `${(process.env.API_URL ?? "http://localhost:8080").replace(/\/+$/, "")}/mcp`;
}
