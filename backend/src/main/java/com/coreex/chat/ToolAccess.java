package com.coreex.chat;

import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Which tools a Chat reply may use, from its scope and switches (ADR 0009, Career scope). The same rule decides the tools
 * offered to the model and each call it makes: a tool not allowed is never run, and a write tool not allowed never becomes
 * a Proposal. A General Chat never gets the Career tools that return Facts or Career results.
 */
record ToolAccess(Chat.Scope scope, UUID applicationId, boolean useNotes, boolean useApplications, boolean useKnowledge) {

	static final String REFUSED = "That tool is not available in this Chat.";

	/** The Career tools that return Facts or Career results, and the Career proposals: never in a General Chat. */
	private static final Set<String> CAREER_ONLY = Set.of("list_facts", "get_fact", "search_knowledge", "get_application_results",
			"add_fact", "add_story");

	private static final Set<String> KNOWLEDGE = Set.of("list_facts", "get_fact", "search_knowledge", "add_fact", "add_story");

	private static final Set<String> APPLICATIONS = Set.of("list_applications", "get_application", "get_application_results");

	/** The Chat's remembered switches, with the ones sent for this message in place of them. */
	static ToolAccess of(Chat chat, Boolean useNotes, Boolean useApplications, Boolean useKnowledge) {
		return new ToolAccess(chat.scope(), chat.applicationId(), useNotes != null ? useNotes : chat.useNotes(),
				useApplications != null ? useApplications : chat.useApplications(),
				useKnowledge != null ? useKnowledge : chat.useKnowledge());
	}

	/** Whether the model is offered the tool. An Application Chat is offered the Application tools, for its own one only. */
	boolean offers(String tool) {
		if (ChatTools.ASK.equals(tool)) {
			return true;
		}
		if (scope == Chat.Scope.GENERAL) {
			return useNotes && !CAREER_ONLY.contains(tool);
		}
		if (KNOWLEDGE.contains(tool)) {
			return useKnowledge;
		}
		if (APPLICATIONS.contains(tool)) {
			return useApplications && !(scope == Chat.Scope.APPLICATION && "list_applications".equals(tool));
		}
		return useNotes;
	}

	/** Whether a call the model made may run: it is offered, and an Application Chat names only its own Application. */
	boolean allows(String tool, Map<String, Object> input) {
		if (!offers(tool)) {
			return false;
		}
		if (scope != Chat.Scope.APPLICATION || !(APPLICATIONS.contains(tool))) {
			return true;
		}
		var key = "get_application".equals(tool) ? "id" : "applicationId";
		return input != null && applicationId.toString().equalsIgnoreCase(String.valueOf(input.get(key)));
	}

}
