package com.coreex.ai;

import java.util.LinkedHashMap;
import java.util.Map;

import tools.jackson.databind.json.JsonMapper;

/**
 * Fixed answers for the end-to-end tests ({@code coreex.ai.provider=fake}): a posting's fields without any model. The
 * company is "Fake Company", the role is the first line, and the posting is the text as given.
 */
class FakeModel implements Model {

	private final JsonMapper json = JsonMapper.builder().build();

	@Override
	public Reply ask(String system, String data, Map<String, Object> schema, long maxTokens) {
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("body")) {
			return new Reply(json.writeValueAsString(Map.of("body", "<p>I build reliable web services.</p>")), 100, 100);
		}
		var text = data.replaceAll("(?s)^\\s*<posting>\\s*|\\s*</posting>\\s*$", "").trim();
		var first = text.lines().map(String::trim).filter(l -> !l.isEmpty()).findFirst().orElse("");
		var answer = new LinkedHashMap<String, String>();
		answer.put("company", "Fake Company");
		answer.put("role", first.length() > 90 ? first.substring(0, 90) : first);
		answer.put("location", "Fake City");
		answer.put("posting", text);
		return new Reply(json.writeValueAsString(answer), 100, 100);
	}

}
