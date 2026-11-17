import { MCP_GROUPS, type McpGroup, type McpTool } from "./mcp-tools";

// The tools of each group, in the order of MCP_GROUPS. A group with no tool is left out.
export function toolsByGroup(tools: McpTool[]): { group: McpGroup; tools: McpTool[] }[] {
  return MCP_GROUPS.map((group) => ({ group, tools: tools.filter((t) => t.group === group) })).filter((g) => g.tools.length > 0);
}

// The tools whose name contains the filter, ignoring case. A space counts as an underscore, so "get item" finds get_item.
export function filterTools(tools: McpTool[], filter: string): McpTool[] {
  const query = filter.trim().toLowerCase().replace(/\s+/g, "_");
  if (query === "") return tools;
  return tools.filter((t) => t.name.includes(query));
}
