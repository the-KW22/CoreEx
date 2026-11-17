package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

/**
 * The tools are documented in one place, the in-app guide's data file (frontend/lib/mcp-tools.ts). Adding, renaming or
 * removing a tool without updating it fails here, and so does a tool with no group, or a group with no tool, so the guide
 * cannot drift from the server. docs/MCP.md only points to the guide.
 */
class McpDocsTest extends McpApiTest {

	// Tests run from backend/, so the repository's other folders are one level up.
	private static final Path GUIDE_DATA = Path.of("..", "frontend", "lib", "mcp-tools.ts");

	private static final Path REPO_GUIDE = Path.of("..", "docs", "MCP.md");

	private Set<String> registeredTools() throws Exception {
		var names = new TreeSet<String>();
		rpc(token, "tools/list", "{}").path("result").path("tools").forEach(t -> names.add(t.path("name").asString()));
		return names;
	}

	@Test
	void theInAppGuideListsExactlyTheToolsTheServerHas() throws Exception {
		var documented = new TreeSet<String>();
		var matcher = Pattern.compile("name:\\s*\"([a-z_]+)\"").matcher(Files.readString(GUIDE_DATA));
		while (matcher.find()) {
			documented.add(matcher.group(1));
		}

		assertThat(documented).isEqualTo(registeredTools());
	}

	@Test
	void everyToolHasAGroupAndEveryGroupHasATool() throws Exception {
		var text = Files.readString(GUIDE_DATA);

		// Each tool's group, from `name: "...", group: "..."`: a tool without a group is not in the map.
		var groupOf = new TreeMap<String, String>();
		var entry = Pattern.compile("name:\\s*\"([a-z_]+)\",\\s*group:\\s*\"([^\"]+)\"").matcher(text);
		while (entry.find()) {
			groupOf.put(entry.group(1), entry.group(2));
		}
		assertThat(groupOf.keySet()).as("every tool in mcp-tools.ts needs a group").isEqualTo(registeredTools());

		// The groups the guide declares, against the groups its tools use.
		var declaredBlock = Pattern.compile("MCP_GROUPS = \\[([\\s\\S]*?)\\] as const").matcher(text);
		assertThat(declaredBlock.find()).as("mcp-tools.ts should declare MCP_GROUPS").isTrue();
		var declared = new TreeSet<String>();
		var quoted = Pattern.compile("\"([^\"]+)\"").matcher(declaredBlock.group(1));
		while (quoted.find()) {
			declared.add(quoted.group(1));
		}
		assertThat(new TreeSet<>(groupOf.values())).as("every group needs at least one tool").isEqualTo(declared);
	}

	@Test
	void theRepositoryGuidePointsToTheInAppGuide() throws Exception {
		assertThat(Files.readString(REPO_GUIDE)).as("docs/MCP.md should point to the in-app guide").contains("/docs/mcp");
	}

}
