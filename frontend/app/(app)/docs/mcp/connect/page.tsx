import { mcpServerAddress, MCP_TOKEN_PLACEHOLDER } from "@/lib/mcp-server";

import { ConnectTabs } from "./connect-tabs";

const h1 = "text-3xl font-semibold tracking-tight md:text-4xl";

// How to add CoreEx to each kind of tool. The commands show this installation's address and the placeholder token.
export default function McpConnectPage() {
  return (
    <>
      <div className="grid gap-3">
        <h1 className={h1}>Connect a client</h1>
        <p className="text-muted-foreground">
          Replace <code className="font-mono">{MCP_TOKEN_PLACEHOLDER}</code> in each command with your Access token.
        </p>
      </div>
      <ConnectTabs server={mcpServerAddress()} token={MCP_TOKEN_PLACEHOLDER} />
    </>
  );
}
