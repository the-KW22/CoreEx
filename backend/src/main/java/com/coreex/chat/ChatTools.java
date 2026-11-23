package com.coreex.chat;

import java.util.List;
import java.util.Map;

import com.coreex.ai.Model;
import com.coreex.identity.User;

/**
 * The tools a Chat reply may call. The default offers none; the tool catalogue (issue #381) replaces it. A tool that
 * throws becomes an error result for the model, so it must say what went wrong in a short message, not a stack trace.
 */
public interface ChatTools {

	/** The Chat-only tool that asks the User a question; a reply that calls it ends and waits for the answer (#376). */
	String ASK = "ask_user_question";

	/** The Chat tool that reads an Asset's file (an image or a PDF), so the model can see what it holds. */
	String READ_ASSET = "read_asset";

	List<Model.ToolSpec> specs();

	String run(User user, String name, Map<String, Object> input);

}
