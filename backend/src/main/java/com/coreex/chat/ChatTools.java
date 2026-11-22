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

	List<Model.ToolSpec> specs();

	String run(User user, String name, Map<String, Object> input);

}
