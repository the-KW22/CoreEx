package com.coreex.ai;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import tools.jackson.databind.json.JsonMapper;

/**
 * Fixed answers for the end-to-end tests ({@code coreex.ai.provider=fake}): a posting's fields without any model. The
 * company is "Fake Company", the role is the first line, and the posting is the text as given.
 */
class FakeModel implements Model {

	private final JsonMapper json = JsonMapper.builder().build();

	/**
	 * A conversation gets one fixed reply. Two triggers in the last message serve the Chat end-to-end tests: "[slow]" writes
	 * a long reply a word at a time (so Stop has something to stop), and "[search]" first runs the search tool with the
	 * rest of the message, then answers (so the answer has sources). "[propose]" proposes a new Note whose text is the rest
	 * of the message, and "[ask]" asks a question with two choices and goes on with the answer.
	 */
	@Override
	public Turn converse(String system, List<Message> messages, List<ToolSpec> tools, Consumer<String> onText, long maxTokens) {
		var last = messages.isEmpty() ? null : messages.get(messages.size() - 1);
		var asked = last == null ? "" : last.blocks().stream().filter(b -> b instanceof ContentBlock.Text)
				.map(b -> ((ContentBlock.Text) b).text()).reduce("", String::concat);
		if (asked.contains("[search]")) {
			var query = asked.replace("[search]", "").strip();
			return new Turn(List.of(new ContentBlock.ToolUse(callId(), "search", Map.of("query", query))),
					StopReason.TOOL_USE, 100, 100);
		}
		if (asked.contains("[propose]")) {
			var text = asked.replace("[propose]", "").strip();
			return new Turn(List.of(new ContentBlock.ToolUse(callId(), "create_note", Map.of("markdown", "# " + text + "\nProposed by the fake model."))),
					StopReason.TOOL_USE, 100, 100);
		}
		if (asked.contains("[ask]")) {
			return new Turn(List.of(new ContentBlock.ToolUse(callId(), "ask_user_question",
					Map.of("question", "Which Folder should it go in?", "choices", List.of("Work", "Home")))), StopReason.TOOL_USE, 100, 100);
		}
		if (last != null && last.blocks().stream().anyMatch(b -> b instanceof ContentBlock.ToolResult)) {
			var answer = last.blocks().stream().filter(b -> b instanceof ContentBlock.ToolResult)
					.map(b -> ((ContentBlock.ToolResult) b).content()).reduce("", String::concat);
			var called = messages.size() < 2 ? "" : messages.get(messages.size() - 2).blocks().stream()
					.filter(b -> b instanceof ContentBlock.ToolUse).map(b -> ((ContentBlock.ToolUse) b).name()).reduce("", String::concat);
			var reply = called.contains("ask_user_question") ? "Going with: " + answer
					: called.contains("create_note") ? "I proposed a Note. It waits for your approval."
							: "This is a fake reply from your Notes.";
			onText.accept(reply);
			return new Turn(List.of(new ContentBlock.Text(reply)), StopReason.END_TURN, 100, 100);
		}
		if (asked.contains("[slow]")) {
			var reply = new StringBuilder();
			for (var i = 0; i < 60; i++) {
				var word = "word" + i + " ";
				onText.accept(word);
				reply.append(word);
				try {
					Thread.sleep(250);
				}
				catch (InterruptedException e) {
					Thread.currentThread().interrupt();
					break;
				}
			}
			return new Turn(List.of(new ContentBlock.Text(reply.toString())), StopReason.END_TURN, 100, 100);
		}
		onText.accept("This is a fake reply.");
		return new Turn(List.of(new ContentBlock.Text("This is a fake reply.")), StopReason.END_TURN, 100, 100);
	}

	/** A tool call id of its own, since a Chat keeps every call and a Proposal is stored by it. */
	private static String callId() {
		return "fake-" + java.util.UUID.randomUUID();
	}

	@Override
	public Reply ask(String system, String data, Map<String, Object> schema, long maxTokens) {
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("asks")) {
				// A reply to an employer's email: what it asks, one start date unconfirmed, a fixed draft and no changes.
				return new Reply(json.writeValueAsString(Map.of("asks", java.util.List.of("Can you share your availability?"),
						"unconfirmed", java.util.List.of("The start date"), "replySubject", "Re: your application",
						"replyBody", "Thank you for your email. I am available next week.", "evidence", java.util.List.of(),
						"changes", java.util.List.of())), 100, 100);
			}
			if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("requirements")) {
			// A Fit check: one requirement shown by the first Fact it was given, or missing when it was given none.
			var fact = java.util.regex.Pattern.compile("<fact id=\"([0-9a-f-]{36})\"").matcher(data);
			var evidence = fact.find() ? java.util.List.of(fact.group(1)) : java.util.List.<String>of();
			var requirement = Map.of("requirement", "Builds web services", "verdict", evidence.isEmpty() ? "MISSING" : "SUPPORTED",
					"evidence", evidence, "note", "From the fake model.");
			var gap = Map.of("requirement", "Leads a team of ten", "verdict", "MISSING", "evidence", java.util.List.<String>of(), "note", "");
			return new Reply(json.writeValueAsString(Map.of("score", 72, "question", "What does a first month look like?",
					"requirements", java.util.List.of(requirement, gap))), 100, 100);
		}
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("draft")) {
			// A Draft: cites the first Fact it was given, if any.
			var fact = java.util.regex.Pattern.compile("<fact id=\"([0-9a-f-]{36})\"").matcher(data);
			var evidence = fact.find() ? java.util.List.of(fact.group(1)) : java.util.List.<String>of();
			return new Reply(json.writeValueAsString(Map.of("draft", "I build reliable web services and care about clear, tested code.", "evidence", evidence)), 100, 100);
		}
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("tightened")) {
			// A Tighten: the first half of the words of the answer it was given.
			var text = java.util.regex.Pattern.compile("(?s)<answer>(.*?)</answer>").matcher(data);
			var words = text.find() ? text.group(1).trim().split("\\s+") : new String[0];
			return new Reply(json.writeValueAsString(Map.of("tightened", String.join(" ", java.util.Arrays.copyOf(words, Math.max(1, words.length / 2))))), 100, 100);
		}
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("plan")) {
			// Interview prep: stresses the first Fact it was given, if any.
			var fact = java.util.regex.Pattern.compile("<fact id=\"([0-9a-f-]{36})\"").matcher(data);
			var evidence = fact.find() ? java.util.List.of(fact.group(1)) : java.util.List.<String>of();
			var stress = evidence.isEmpty() ? java.util.List.of()
					: java.util.List.of(Map.of("point", "Stress your web services work", "evidence", evidence));
			return new Reply(json.writeValueAsString(Map.of("plan", java.util.List.of("Reread the posting", "Pick two stories", "Rehearse out loud"),
					"about", "A fake company hiring an engineer.", "stress", stress, "ask", java.util.List.of("What does a first month look like?"),
					"practice", java.util.List.of("Tell me about yourself.", "Why do you want this role?",
					"Describe a project you are proud of.", "Tell me about a hard bug you fixed."))), 100, 100);
		}
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("works")) {
			// Practice feedback: quotes the first four words of the answer it was given.
			var typed = java.util.regex.Pattern.compile("(?s)<practice[^>]*>(.*?)</practice>").matcher(data);
			var words = typed.find() ? typed.group(1).trim().split("\\s+") : new String[0];
			var quote = String.join(" ", java.util.Arrays.copyOf(words, Math.min(4, words.length)));
			return new Reply(json.writeValueAsString(Map.of("works", java.util.List.of(Map.of("quote", quote, "why", "Clear and direct.")),
					"strengthen", "Add one concrete result.")), 100, 100);
		}
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("improve")) {
			return new Reply(json.writeValueAsString(Map.of("improve", java.util.List.of("Give a specific example next time."))), 100, 100);
		}
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("suggestions")) {
			var original = json.readTree(data).path("fields").path("summary").asText();
			var suggestions = original.isBlank() ? java.util.List.of() : java.util.List.of(Map.of("field", "summary", "original", original, "suggestion", original));
			return new Reply(json.writeValueAsString(Map.of("suggestions", suggestions)), 100, 100);
		}
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("suggestion")) {
			return new Reply(json.writeValueAsString(Map.of("suggestion", json.readTree(data).path("original").asText())), 100, 100);
		}
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("sections")) {
			var source = json.readTree(data).path("text").asText();
			var first = source.lines().map(String::trim).filter(s -> !s.isEmpty()).findFirst().orElse("");
			return new Reply(json.writeValueAsString(Map.of("name", first, "headline", "", "email", "", "phone", "", "location", "", "website", "", "summary", "", "sections", java.util.List.of())), 100, 100);
		}
		if (schema.get("properties") instanceof Map<?, ?> properties && properties.containsKey("subject") && properties.containsKey("attach")) {
			// An Application email: cites the first Fact it was given, and attaches the documents its data lists.
			var fact = java.util.regex.Pattern.compile("<fact id=\"([0-9a-f-]{36})\"").matcher(data);
			var evidence = fact.find() ? java.util.List.of(fact.group(1)) : java.util.List.<String>of();
			var attach = java.util.List.of("RESUME", "COVER_LETTER").stream().filter(k -> data.contains("<file kind=\"" + k + "\">")).toList();
			return new Reply(json.writeValueAsString(Map.of("subject", "Application for the role", "body", "I would like to apply for this role.",
					"attach", attach, "evidence", evidence)), 100, 100);
		}
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
