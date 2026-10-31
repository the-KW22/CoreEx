package com.coreex.mcp;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

/**
 * The tools are documented by hand in two places (the in-app guide's data file and docs/MCP.md). Adding, renaming or
 * removing a tool without updating them fails here, so the guides cannot drift from the server.
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
	void theRepositoryGuideMentionsEveryTool() throws Exception {
		var text = Files.readString(REPO_GUIDE);

		for (var tool : registeredTools()) {
			assertThat(text).as("docs/MCP.md should mention `" + tool + "`").contains("`" + tool + "`");
		}
	}

}
