package com.coreex.mcp;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.career.CareerService;
import com.coreex.common.ApiException;
import com.coreex.knowledge.KnowledgeService;
import com.coreex.knowledge.KnowledgeService.FactView;

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

	private static final Set<String> SOURCE_KINDS = Set.of("MANUAL", "RESUME", "NOTE");

	record Fact(UUID id, String text, String category, String sourceKind, UUID sourceId, String quote, Instant updatedAt) {
	}

	record FactList(List<Fact> facts) {
	}

	record ResultRow(UUID id, String kind, Object result, String resolution, boolean outOfDate, Instant createdAt) {
	}

	record ResultList(List<ResultRow> results) {
	}

	private final KnowledgeService knowledge;

	private final CareerService career;

	CareerTools(KnowledgeService knowledge, CareerService career) {
		this.knowledge = knowledge;
		this.career = career;
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

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "add_fact", description = "Add a Fact to the User's Knowledge: one short true statement about their career, in a category (EXPERIENCE, SKILL, ACHIEVEMENT, EDUCATION or OTHER). Without sourceKind it is a Fact the User gave (MANUAL). To pull one from a Resume or Note, pass sourceKind RESUME or NOTE with its sourceId and the quote: the exact words from that source, which must still be in its current text. A line already pulled, or one the User forgot, is refused. Returns the Fact as list_facts shows it.")
	Fact addFact(McpTransportContext context, @McpToolParam(description = "The Fact, one short true statement") String text,
			@McpToolParam(description = "EXPERIENCE, SKILL, ACHIEVEMENT, EDUCATION or OTHER") String category,
			@McpToolParam(required = false, description = "MANUAL (the default), RESUME or NOTE") String sourceKind,
			@McpToolParam(required = false, description = "The id of the Resume or Note, for RESUME or NOTE") UUID sourceId,
			@McpToolParam(required = false, description = "The exact words from the Resume or Note; needed for RESUME or NOTE") String quote) {
		if (category == null || !CATEGORIES.contains(category)) {
			throw Input.invalid("category must be EXPERIENCE, SKILL, ACHIEVEMENT, EDUCATION or OTHER.");
		}
		var kind = sourceKind == null ? "MANUAL" : sourceKind;
		if (!SOURCE_KINDS.contains(kind)) {
			throw Input.invalid("sourceKind must be MANUAL, RESUME or NOTE.");
		}
		if (!"MANUAL".equals(kind) && (sourceId == null || quote == null || quote.isBlank())) {
			throw Input.invalid("A Fact from a Resume or Note needs its sourceId and the quote.");
		}
		return fact(knowledge.create(owner(context), Input.required("text", text, FACT_MAX), category, kind, sourceId,
				Input.optional("quote", quote, FACT_MAX)));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "switch_off_fact", description = "Switch a Fact off for AI: it stays in the User's Knowledge but is hidden from list_facts and get_fact and is never used. Only the User can switch it back on, in the app. A Fact already switched off, or one that does not exist, is \"no such Fact\".")
	WriteTools.Done switchOffFact(McpTransportContext context, @McpToolParam(description = "The Fact's id") UUID id) {
		getFact(context, id); // an off Fact is invisible to Agents, so it is "no such Fact" here too
		knowledge.setStatus(owner(context), id, "OFF");
		return new WriteTools.Done(id, "Switched off. Only the User can switch it back on, in the app.");
	}


	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "get_application_results", description = "List what the Career AI made for one Application, newest first: a Fit check (a score and each requirement with the Facts it cites), an answer, interview prep, a practice review, an email or a reply from an employer. Each has its id, kind, result, resolution (null while an answer waits for Accept or Reject) and outOfDate, true when the Facts or posting it was made from have changed since.")
	ResultList getApplicationResults(McpTransportContext context,
			@McpToolParam(description = "The Application's id") UUID applicationId) {
		return new ResultList(career.results(owner(context), applicationId).stream()
				.map(s -> new ResultRow(s.id(), s.kind(), s.result(), s.resolution(), s.outOfDate(), s.createdAt())).toList());
	}

}
