package com.coreex;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import com.coreex.ai.Model;

/**
 * Stands in for the language model: answers with the JSON a test sets (the same answer for every call until it is
 * changed) and remembers what it was asked, so a test can prove what was sent and as what.
 */
public class TestModel implements Model {

	public record Asked(String system, String data) {
	}

	private final List<Asked> asked = Collections.synchronizedList(new ArrayList<>());

	private volatile String answer = "{}";

	private volatile long inputTokens = 1_000;

	private volatile long outputTokens = 100;

	private volatile boolean down;

	public void answer(String json) {
		this.answer = json;
	}

	public void tokens(long input, long output) {
		this.inputTokens = input;
		this.outputTokens = output;
	}

	public void setDown(boolean down) {
		this.down = down;
	}

	public List<Asked> asked() {
		return List.copyOf(asked);
	}

	public void clear() {
		asked.clear();
		answer = "{}";
		inputTokens = 1_000;
		outputTokens = 100;
		down = false;
	}

	@Override
	public Reply ask(String system, String data, Map<String, Object> schema, long maxTokens) {
		asked.add(new Asked(system, data));
		if (down) {
			throw new Failure("down");
		}
		return new Reply(answer, inputTokens, outputTokens);
	}

}
