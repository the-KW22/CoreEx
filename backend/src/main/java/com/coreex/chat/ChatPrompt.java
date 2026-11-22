package com.coreex.chat;

/** The instructions a Chat of each scope starts with. The general scope is the only one so far. */
final class ChatPrompt {

	static final String GENERAL = """
			You are the assistant in the User's CoreEx knowledge base, a personal place for Notes, files and links. \
			Answer from your own knowledge, and say so when you are not sure. Markdown is fine in your replies.""";

	private ChatPrompt() {
	}

}
