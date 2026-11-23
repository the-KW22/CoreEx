package com.coreex.chat;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.ai.Model;
import com.coreex.common.ApiException;
import com.coreex.identity.User;
import com.coreex.items.Item;
import com.coreex.mcp.ToolCatalogue;
import com.coreex.search.SearchService;

import tools.jackson.databind.json.JsonMapper;

/**
 * The tools a Chat reply may call (ADR 0007): the read tools of the {@link ToolCatalogue}, the Chat-only {@code search}
 * (pieces of Notes by meaning) and {@code ask_user_question}, and the write tools the model may propose. A write tool is
 * offered so the model can propose, but {@link #run} never runs one: the reply stores a Proposal for it instead, and it
 * runs only when the User approves. Every result is cut at {@code coreex.chat.max-tool-result-characters}.
 */
@Component
class ChatToolbox implements ChatTools {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final String SEARCH = "search";

	private static final int SEARCH_LIMIT = 8;

	private static final String CUT = "…(cut: result too long, narrow your request)";

	/** What search returns: the pieces found, best first. */
	record Found(List<SearchService.Chunk> chunks) {
	}

	private final ToolCatalogue catalogue;

	private final SearchService search;

	private final ChatProperties properties;

	private final List<Model.ToolSpec> specs;

	private final Set<String> offered;

	ChatToolbox(ToolCatalogue catalogue, SearchService search, ChatProperties properties) {
		this.catalogue = catalogue;
		this.search = search;
		this.properties = properties;
		var reads = Stream.concat(Stream.of(chatSearch()),
				catalogue.specs().stream().filter(spec -> !SEARCH.equals(spec.name()))).toList();
		// Only what can run is "offered": a write tool or the question is never run here.
		this.offered = reads.stream().map(Model.ToolSpec::name).collect(Collectors.toUnmodifiableSet());
		this.specs = Stream.of(reads.stream(), catalogue.writeSpecs().stream(), Stream.of(askUserQuestion()))
				.flatMap(s -> s).toList();
	}

	@Override
	public List<Model.ToolSpec> specs() {
		return specs;
	}

	@Override
	public String run(User user, String name, Map<String, Object> input) {
		if (!offered.contains(name)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "UNKNOWN_TOOL", "That tool is not available in Chat.");
		}
		var result = SEARCH.equals(name) ? searchPieces(user, input) : catalogue.call(user, name, input);
		return cap(result);
	}

	private static Model.ToolSpec askUserQuestion() {
		var question = Map.<String, Object>of("type", "string", "description", "The question, short and specific");
		var choices = Map.<String, Object>of("type", "array", "items", Map.of("type", "string"), "minItems", 2, "maxItems", 5,
				"description", "The answers you suggest, a few words each. The User can also write their own answer.");
		return new Model.ToolSpec(ASK, "Asks the User a question and waits for the answer, which comes back as the result. "
				+ "Use it when a request is unclear and a wrong guess would cost them effort, for example which Folder a new "
				+ "Note should go in. Do not use it for what you can find out with your read tools. Call it alone, not together "
				+ "with other tools.", Map.of("type", "object", "properties", Map.of("question", question, "choices", choices),
						"required", List.of("question", "choices")));
	}

	private static Model.ToolSpec chatSearch() {
		var query = Map.<String, Object>of("type", "string",
				"description", "What to look for, in your own words or the User's");
		return new Model.ToolSpec(SEARCH, "Finds pieces of the User's Notes, Applications and Resumes by meaning and by "
				+ "words, best first, up to 8: each has its Item's id, title, the heading it sits under (headingPath) and its "
				+ "text. Use it to find what to look at; call get_item with the id to read the whole Item.",
				Map.of("type", "object", "properties", Map.of("query", query), "required", List.of("query")));
	}

	/** The closest pieces by meaning; when none is close enough or the query cannot be embedded, the exact-word hits. */
	private String searchPieces(User user, Map<String, Object> input) {
		var query = input == null ? null : input.get("query");
		if (!(query instanceof String text) || text.isBlank()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "query is required.");
		}
		var found = search.chunks(user.id(), text, SEARCH_LIMIT);
		if (found.isEmpty()) {
			found = search.search(user.id(), text, null, null, null, 0, SEARCH_LIMIT).hits().stream()
					.filter(hit -> hit.type() != Item.Type.ASSET)
					.map(hit -> new SearchService.Chunk(hit.id(), hit.type(), hit.title(), null,
							hit.snippet().stream().map(SearchService.Segment::text).collect(Collectors.joining()), 0))
					.toList();
		}
		return JSON.writeValueAsString(new Found(found));
	}

	private String cap(String result) {
		var max = properties.maxToolResultCharacters();
		return result.length() <= max ? result : result.substring(0, max) + CUT;
	}

}
