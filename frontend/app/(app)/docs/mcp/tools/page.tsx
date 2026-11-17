import { MCP_TOOLS } from "@/lib/mcp-tools";

import { ToolsReference } from "../tools-reference";

const h1 = "text-3xl font-semibold tracking-tight md:text-4xl";

// Every tool the server has, by group. The Agent chooses the tools itself.
export default function McpToolsPage() {
  return (
    <>
      <div className="grid gap-3">
        <h1 className={h1}>Tools</h1>
        <p className="text-muted-foreground">
          The Agent chooses the tools itself. Your tool may ask you to approve each call; leaving that on lets you see what an
          Agent is about to do.
        </p>
      </div>
      <ToolsReference tools={MCP_TOOLS} />
      <p className="text-sm text-muted-foreground">
        There is no tool to delete for good, empty the Trash, delete a Tag, import files or use Admin. Files move only through
        short-lived links: the Agent sends or fetches them itself, and anyone who has a link can use it until it expires.
      </p>
    </>
  );
}
