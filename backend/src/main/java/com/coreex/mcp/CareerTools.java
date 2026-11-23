package com.coreex.mcp;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.career.CareerService;
import com.coreex.common.ApiException;
import com.coreex.knowledge.KnowledgeService;
import com.coreex.knowledge.KnowledgeService.FactView;
import com.coreex.notes.NoteService;

import io.modelcontextprotocol.common.McpTransportContext;

/**
 * What an Agent can do with Career Knowledge and Career results. Like the other tools, each goes through the service with
 * the calling User's id. A switched-off Fact is never returned: it must not reach a model.
 */
@Component
class CareerTools {

	// As the Knowledge REST API's limits (KnowledgeController); repeated here, as Input does for the others.
	private static final int FACT_MAX = 2000;

	private static final Set<String> CATEGORIES = Set.of("EXPERIENCE", "SKILL", "ACHIEVEMENT", "EDUCATION", "OTHER");

	private static final Set<String> SOURCE_KINDS = Set.of("MANUAL", "RESUME", "NOTE", "CHAT");

	// The Story limits: each part of a Story at most 4000 characters, as the Note's own text for search is cut to 1500 below.
	private static final int STORY_FIELD_MAX = 4000;

	private static final int TITLE_MAX = 200;

	private static final int SEARCH_LIMIT = 8;

	private static final int SEARCH_TEXT_MAX = 1500;

	private static final int QUERY_MAX = 500;

	record Fact(UUID id, String text, String category, String sourceKind, UUID sourceId, String quote, Instant updatedAt) {
	}

	/** One item of search_knowledge: a Fact (kind FACT, with its category) or a Story Note (kind STORY, with its title). */
	record KnowledgeHit(UUID id, String kind, String title, String category, String text) {
	}

	record StorySaved(UUID id, String title) {
	}

	record FactList(List<Fact> facts) {
	}

	record ResultRow(UUID id, String kind, Object result, String resolution, boolean outOfDate, Instant createdAt) {
	}

	record ResultList(List<ResultRow> results) {
	}

	private final KnowledgeService knowledge;

	private final CareerService career;

	private final NoteService notes;

	CareerTools(KnowledgeService knowledge, CareerService career, NoteService notes) {
		this.knowledge = knowledge;
		this.career = career;
		this.notes = notes;
	}

	private static UUID owner(McpTransportContext context) {
		return McpConfig.agent(context).user().id();
	}

	private static Fact fact(FactView view) {
		var f = view.fact();
		return new Fact(f.id(), f.text(), f.category(), f.sourceKind(), f.sourceId(), f.quote(), f.updatedAt());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "list_facts", description = "List the User's Facts: the short true statements of their career that Agents may use, newest first. Each has its text, category, where it came from (sourceKind, sourceId and the quote from that source) and when it changed. Only ACTIVE Facts are returned: a switched-off Fact is never shown, because it must not be used. Pass category to see one kind (EXPERIENCE, SKILL, ACHIEVEMENT, EDUCATION or OTHER).")
	FactList listFacts(McpTransportContext context,
			@McpToolParam(required = false, description = "Only this category: EXPERIENCE, SKILL, ACHIEVEMENT, EDUCATION or OTHER") String category) {
		return new FactList(knowledge.facts(owner(context), category, "ACTIVE").stream().map(CareerTools::fact).toList());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "get_fact", description = "Read one Fact by its id, in the same form as list_facts. A switched-off Fact, or one that does not exist, is \"no such Fact\".")
	Fact getFact(McpTransportContext context, @McpToolParam(description = "The Fact's id") UUID id) {
		var view = knowledge.factView(owner(context), id);
		if (!"ACTIVE".equals(view.fact().status())) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Fact.");
		}
		return fact(view);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "add_fact", description = "Add a Fact to the User's Knowledge: one short true statement about their career, in a category (EXPERIENCE, SKILL, ACHIEVEMENT, EDUCATION or OTHER). Without sourceKind it is a Fact the User gave (MANUAL). To pull one from a Resume or Note, pass sourceKind RESUME or NOTE with its sourceId and the quote: the exact words from that source, which must still be in its current text. To keep the User's own words from a Chat, pass sourceKind CHAT with the Chat's id as sourceId and the quote: the exact words the User wrote in a message of that Chat. A line already pulled, or one the User forgot, is refused. Returns the Fact as list_facts shows it.")
	Fact addFact(McpTransportContext context, @McpToolParam(description = "The Fact, one short true statement") String text,
			@McpToolParam(description = "EXPERIENCE, SKILL, ACHIEVEMENT, EDUCATION or OTHER") String category,
			@McpToolParam(required = false, description = "MANUAL (the default), RESUME, NOTE or CHAT") String sourceKind,
			@McpToolParam(required = false, description = "The id of the Resume, Note or Chat, for RESUME, NOTE or CHAT") UUID sourceId,
			@McpToolParam(required = false, description = "The exact words from the Resume, Note or the User's Chat message; needed for RESUME, NOTE or CHAT") String quote) {
		if (category == null || !CATEGORIES.contains(category)) {
			throw Input.invalid("category must be EXPERIENCE, SKILL, ACHIEVEMENT, EDUCATION or OTHER.");
		}
		var kind = sourceKind == null ? "MANUAL" : sourceKind;
		if (!SOURCE_KINDS.contains(kind)) {
			throw Input.invalid("sourceKind must be MANUAL, RESUME, NOTE or CHAT.");
		}
		if (!"MANUAL".equals(kind) && (sourceId == null || quote == null || quote.isBlank())) {
			throw Input.invalid("A Fact from a Resume, Note or Chat needs its sourceId and the quote.");
		}
		return fact(knowledge.create(owner(context), Input.required("text", text, FACT_MAX), category, kind, sourceId,
				Input.optional("quote", quote, FACT_MAX)));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "add_story", description = "Add a Story to the User's Knowledge: a Note with the five Story headings (Situation, Task, Action, Result, Reflection), so it is listed among their Stories. Give the title, and the situation, action and result; task and reflection are optional. Returns the Note's id and title.")
	StorySaved addStory(McpTransportContext context, @McpToolParam(description = "The Story's title") String title,
			@McpToolParam(description = "The situation the Story starts in") String situation,
			@McpToolParam(required = false, description = "The User's task in it") String task,
			@McpToolParam(description = "What the User did") String action,
			@McpToolParam(description = "What came of it") String result,
			@McpToolParam(required = false, description = "What the User took from it") String reflection) {
		var body = "## Situation\n\n" + Input.required("situation", situation, STORY_FIELD_MAX) + "\n\n## Task\n\n"
				+ Objects.requireNonNullElse(Input.optional("task", task, STORY_FIELD_MAX), "") + "\n\n## Action\n\n"
				+ Input.required("action", action, STORY_FIELD_MAX) + "\n\n## Result\n\n"
				+ Input.required("result", result, STORY_FIELD_MAX) + "\n\n## Reflection\n\n"
				+ Objects.requireNonNullElse(Input.optional("reflection", reflection, STORY_FIELD_MAX), "") + "\n";
		var note = knowledge.newStory(owner(context), Input.required("title", title, TITLE_MAX), body);
		return new StorySaved(note.id(), note.title());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "switch_off_fact", description = "Switch a Fact off for AI: it stays in the User's Knowledge but is hidden from list_facts and get_fact and is never used. Only the User can switch it back on, in the app. A Fact already switched off, or one that does not exist, is \"no such Fact\".")
	WriteTools.Done switchOffFact(McpTransportContext context, @McpToolParam(description = "The Fact's id") UUID id) {
		getFact(context, id); // an off Fact is invisible to Agents, so it is "no such Fact" here too
		knowledge.setStatus(owner(context), id, "OFF");
		return new WriteTools.Done(id, "Switched off. Only the User can switch it back on, in the app.");
	}


	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "search_knowledge", description = "Search the User's Knowledge for a query, in words: up to 8 items, best first. Each is an ACTIVE Fact (kind FACT, with its text and category) or a Story Note (kind STORY, with its title and its text, cut). Only the query's words of three letters or more count, and an item with none of them is not returned. A switched-off Fact is never returned.")
	List<KnowledgeHit> searchKnowledge(McpTransportContext context,
			@McpToolParam(description = "What to look for, in words") String query) {
		var owner = owner(context);
		var words = words(Input.required("query", query, QUERY_MAX));
		var scored = new ArrayList<Scored>();
		// shortcut: all Facts and Stories are matched in memory, unpaged, with one Note read per Story; upgrade to Postgres full-text search when a User holds hundreds of them.
		for (var fact : knowledge.facts(owner, null, "ACTIVE")) {
			var score = matches(words, fact.fact().text());
			if (score > 0) {
				scored.add(new Scored(score, fact.fact().updatedAt(), new KnowledgeHit(fact.fact().id(), "FACT", null,
						fact.fact().category(), fact.fact().text())));
			}
		}
		for (var story : knowledge.stories(owner)) {
			var body = notes.get(owner, story.id()).body();
			var score = matches(words, story.title() + " " + body);
			if (score > 0) {
				scored.add(new Scored(score, story.updatedAt(), new KnowledgeHit(story.id(), "STORY", story.title(), null,
						body.length() > SEARCH_TEXT_MAX ? body.substring(0, SEARCH_TEXT_MAX) : body)));
			}
		}
		return scored.stream().sorted(Comparator.comparingInt(Scored::score).reversed().thenComparing(Scored::updatedAt, Comparator.reverseOrder()))
				.limit(SEARCH_LIMIT).map(Scored::hit).toList();
	}

	private record Scored(int score, Instant updatedAt, KnowledgeHit hit) {
	}

	/** The distinct words of three letters or more, lowercased. */
	private static Set<String> words(String text) {
		return Arrays.stream(text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+")).filter(w -> w.length() >= 3).collect(Collectors.toSet());
	}

	/** How many distinct query words the text holds. */
	private static int matches(Set<String> query, String text) {
		var found = words(text);
		return (int) query.stream().filter(found::contains).count();
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "get_application_results", description = "List what the Career AI made for one Application, newest first: a Fit check (a score worked out from the verdicts, each requirement with its kind, the Facts it cites and a plan for a gap, what decides the hire, keywords, and who made it), an answer, interview prep, a practice review, an email or a reply from an employer. Each has its id, kind, result, resolution (null while an answer waits for Accept or Reject) and outOfDate, true when the Facts or posting it was made from have changed since.")
	ResultList getApplicationResults(McpTransportContext context,
			@McpToolParam(description = "The Application's id") UUID applicationId) {
		return new ResultList(career.results(owner(context), applicationId).stream()
				.map(s -> new ResultRow(s.id(), s.kind(), s.result(), s.resolution(), s.outOfDate(), s.createdAt())).toList());
	}

	private static final String FIT_SHAPE = "A JSON object: question (one question to ask the employer), priorities (3 to 5 short lines on what decides the hire), "
			+ "keywords (up to 20, copied word for word from the posting) and requirements (at most 15), each with requirement, kind (MUST, NICE or GATE), "
			+ "verdict (SUPPORTED, PARTLY or MISSING), evidence (ids of Facts, Stories or the Resume that show it, from list_facts), note, plan (NONE, FRAME, CLOSE or DO_NOT_CLAIM), "
			+ "planNote and confirm (a question for the User on a GATE the evidence does not show, else empty). Do not send a score: CoreEx works it out.";

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "run_fit_check", description = "Run CoreEx's own AI Fit check on one Application, as the Fit tab's button does, and keep the result. It uses the Application's posting, Resume, Knowledge, Stories and Preferences, and spends the User's daily AI budget (or their own key). Refused when the posting is empty, AI is off or the budget is spent. Returns the result as get_application_results shows it. To do the analysis yourself with no CoreEx AI, use save_fit_check.")
	ResultRow runFitCheck(McpTransportContext context, @McpToolParam(description = "The Application's id") UUID applicationId) {
		return row(career.fit(owner(context), applicationId));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "save_fit_check", description = "Save a Fit check you worked out yourself on one Application, with no CoreEx AI call and no budget spent. Read the Application, its posting, the Resume and list_facts first. Only ids from the User's own evidence count: any other id is dropped and its requirement becomes MISSING. CoreEx works out the score from your verdicts and ignores any you send. It is marked out of date when the posting or Knowledge changes, and shown as made by your agent. Returns the result as get_application_results shows it.")
	ResultRow saveFitCheck(McpTransportContext context, @McpToolParam(description = "The Application's id") UUID applicationId,
			@McpToolParam(description = FIT_SHAPE) String fit) {
		return row(career.saveFit(owner(context), applicationId, fit));
	}

	private static ResultRow row(CareerService.Stored s) {
		return new ResultRow(s.id(), s.kind(), s.result(), s.resolution(), s.outOfDate(), s.createdAt());
	}

}
