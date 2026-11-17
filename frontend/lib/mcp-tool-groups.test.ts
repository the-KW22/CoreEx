import { describe, expect, it } from "vitest";

import { filterTools, toolsByGroup } from "./mcp-tool-groups";
import { MCP_GROUPS, MCP_TOOLS, type McpTool } from "./mcp-tools";

const tool = (name: string, group: McpTool["group"] = "Notes"): McpTool => ({
  name,
  group,
  kind: "read",
  summary: "",
  useWhen: "",
});

describe("toolsByGroup", () => {
  it("keeps the groups in the order of the list and each tool once", () => {
    const groups = toolsByGroup(MCP_TOOLS);
    const order = groups.map((g) => g.group);
    expect(order).toEqual(MCP_GROUPS.filter((g) => order.includes(g)));
    expect(groups.flatMap((g) => g.tools)).toHaveLength(MCP_TOOLS.length);
  });

  it("leaves out a group with no tool", () => {
    const groups = toolsByGroup([tool("create_note", "Notes"), tool("get_fact", "Career Facts")]);
    expect(groups.map((g) => g.group)).toEqual(["Notes", "Career Facts"]);
  });

  it("gives every tool in MCP_TOOLS a group from the list", () => {
    for (const t of MCP_TOOLS) {
      expect(MCP_GROUPS).toContain(t.group);
    }
  });
});

describe("filterTools", () => {
  const tools = [tool("list_items"), tool("list_tags"), tool("get_item")];

  it("returns every tool for an empty or blank filter", () => {
    expect(filterTools(tools, "")).toEqual(tools);
    expect(filterTools(tools, "   ")).toEqual(tools);
  });

  it("matches part of a name, ignoring case", () => {
    expect(filterTools(tools, "LIST").map((t) => t.name)).toEqual(["list_items", "list_tags"]);
  });

  it("reads a space as an underscore, so a name typed with spaces still finds the tool", () => {
    expect(filterTools(tools, "get item").map((t) => t.name)).toEqual(["get_item"]);
  });

  it("returns nothing when no name matches", () => {
    expect(filterTools(tools, "trash")).toEqual([]);
  });
});
