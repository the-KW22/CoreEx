package com.coreex;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import tools.jackson.databind.json.JsonMapper;

import com.coreex.ai.Model;
import com.coreex.ai.Model.ContentBlock;
import com.coreex.ai.Model.Message;
import com.coreex.ai.Model.StopReason;
import com.coreex.ai.Model.ToolSpec;
import com.coreex.ai.Model.Turn;

/**
 * Stands in for the language model. {@code ask} answers with the JSON a test sets (the same answer for every call until
 * it is changed). {@code converse} plays the turns a test scripts, in order, and records what it was sent: the system
 * text, the messages and the tools, so a test can prove what was sent and as what.
 */
public class TestModel implements Model {

	public record Asked(String system, String data) {
	}

	/** One conversation turn as the model received it. */
	public record Conversed(String system, List<Message> messages, List<ToolSpec> tools) {
	}

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final List<Asked> asked = Collections.synchronizedList(new ArrayList<>());

	private final List<Conversed> conversed = Collections.synchronizedList(new ArrayList<>());

	private final Deque<Turn> script = new ArrayDeque<>();

	private volatile String answer = "{}";

	private volatile long inputTokens = 1_000;

	private volatile long outputTokens = 100;

	private volatile boolean down;

	/** A turn where the model writes this text and stops. */
	public static Turn text(String text) {
		return new Turn(List.of(new ContentBlock.Text(text)), StopReason.END_TURN, 1_000, 100);
	}

	/** A turn where the model asks for a tool to be run with this JSON input. */
	@SuppressWarnings("unchecked")
	public static Turn toolUse(String name, String jsonInput) {
		Map<String, Object> input = JSON.readValue(jsonInput, Map.class);
		var id = "toolu_" + UUID.randomUUID().toString().substring(0, 8);
		return new Turn(List.of(new ContentBlock.ToolUse(id, name, input)), StopReason.TOOL_USE, 1_000, 100);
	}

	/** The same turn with the tokens the provider reports for it. */
	public static Turn usage(Turn turn, long input, long output) {
		return new Turn(turn.blocks(), turn.stopReason(), input, output);
	}

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

	/** Queues turns for the next {@code converse} calls, in order. */
	public synchronized void script(Turn... turns) {
		script.addAll(List.of(turns));
	}

	public List<Asked> asked() {
		return List.copyOf(asked);
	}

	public List<Conversed> conversed() {
		return List.copyOf(conversed);
	}

	public synchronized void clear() {
		asked.clear();
		conversed.clear();
		script.clear();
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

	@Override
	public Turn converse(String system, List<Message> messages, List<ToolSpec> tools, Consumer<String> onText, long maxTokens) {
		conversed.add(new Conversed(system, List.copyOf(messages), List.copyOf(tools)));
		if (down) {
			throw new Failure("down");
		}
		var turn = next();
		for (var block : turn.blocks()) {
			if (block instanceof ContentBlock.Text text) {
				onText.accept(text.text());
			}
		}
		return turn;
	}

	private synchronized Turn next() {
		if (script.isEmpty()) {
			throw new IllegalStateException("No scripted turn is left: script one with TestModel.script first");
		}
		return script.poll();
	}

}
