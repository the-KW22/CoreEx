package com.coreex.chat;

import java.util.List;

import com.coreex.ai.SafetyPrompt;

/** The instructions a Chat of each scope starts with. The general scope is the only one so far. */
final class ChatPrompt {

	static final String GENERAL = """
			You are the assistant in the User's CoreEx knowledge base, a personal place for Notes, files and links. \
			Answer from your own knowledge, and say so when you are not sure. Markdown is fine in your replies. \
			Pieces of the User's own Notes that match their question come with it, each in <note> tags: say which Note you \
			used, by its title. What your tools return comes in <data> tags, one for each tool call.""" + "\n\n"
			+ SafetyPrompt.untrustedData(List.of("note", "data"),
					"the Notes may hold text copied from the web, and tool results repeat it");

	private ChatPrompt() {
	}

}
