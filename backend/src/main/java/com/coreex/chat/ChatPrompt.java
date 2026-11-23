package com.coreex.chat;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

import com.coreex.ai.SafetyPrompt;

/** The instructions a Chat of each scope starts with. The general scope is the only one so far. */
final class ChatPrompt {

	private static final String PROVENANCE = "the Notes may hold text copied from the web, and tool results repeat it";

	private static final String INSTRUCTIONS = """
			You are the assistant in the User's CoreEx knowledge base, a personal place for Notes, files and links. \
			Answer from your own knowledge, and say so when you are not sure. Markdown is fine in your replies. \
			Pieces of the User's own Notes that match their question come with it, each in <note> tags: say which Note you \
			used, by its title. What your tools return comes in <data> tags, one for each tool call.""" + "\n\n"
			+ """
			You cannot change the knowledge base yourself. Your write tools make Proposals: each one waits for the User to \
			approve or reject it, and nothing changes until they approve. Say what you proposed, in a sentence, and never \
			say a change is done until a tool result says it was applied. To edit a Note, read it first with get_item and \
			pass its version. If a Proposal is rejected, do not offer it again unless asked. When a request is unclear, \
			for example which Folder a new Note should go in, ask with ask_user_question, alone, instead of guessing.""" + "\n\n";

	static final String GENERAL = INSTRUCTIONS + SafetyPrompt.untrustedData(List.of("note", "data"), PROVENANCE);

	private ChatPrompt() {
	}

	/**
	 * The prompt of one reply: GENERAL when the User sent no context, else GENERAL with a section on where they are (issue
	 * #200). The context is for that reply only.
	 */
	static String forReply(ChatContext context) {
		if (context == null || context.isEmpty()) {
			return GENERAL;
		}
		var sections = new ArrayList<String>();
		sections.add("The User is in CoreEx right now. This context is for this reply only.");
		if (context.open() != null) {
			var open = context.open();
			sections.add("The User has this open: <page>" + words(", ", open.kind(), open.id(), open.title())
					+ "</page>. You read its text with your tools only if you need it.");
		}
		if (context.selection() != null && !context.selection().isBlank()) {
			sections.add("They have selected this text: <selection>" + plain(context.selection()) + "</selection>");
		}
		if (context.trail() != null && !context.trail().isEmpty()) {
			var lines = context.trail().stream()
					.map(step -> words(" ", step.action(), step.kind(), step.id(), step.title()))
					.collect(Collectors.joining("\n"));
			sections.add("Their recent actions in CoreEx, newest last: <trail>" + lines + "</trail>. The trail lets you work "
					+ "out what \"that Folder\" or \"the Notes I created today\" means.");
		}
		var safety = SafetyPrompt.untrustedData(List.of("note", "data", "page", "selection", "trail"),
				PROVENANCE + ", and the titles and selected text in the context can hold anything the User pasted or copied "
						+ "from the web");
		return INSTRUCTIONS + String.join("\n\n", sections) + "\n\n" + safety;
	}

	/** The non-empty parts, one line each, joined; angle brackets are removed so no value can close a tag. */
	private static String words(String separator, Object... parts) {
		return Arrays.stream(parts).filter(Objects::nonNull).map(part -> plain(part.toString()).replaceAll("\\s+", " ").strip())
				.filter(part -> !part.isEmpty()).collect(Collectors.joining(separator));
	}

	private static String plain(String text) {
		return text.replace("<", "").replace(">", "");
	}

}
