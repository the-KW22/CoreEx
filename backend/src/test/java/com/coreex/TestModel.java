package com.coreex;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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

	/**
	 * Holds the next scripted text turn half-way: the first half of the text is written, then the model waits until the
	 * test releases it. Lets a test act on a reply that is running (a second send, a Stop, a closed stream).
	 */
	public static final class Gate {

		private final CountDownLatch entered = new CountDownLatch(1);

		private final CountDownLatch released = new CountDownLatch(1);

		/** Waits until the model has written the first half and is holding. */
		public boolean awaitEntered() throws InterruptedException {
			return entered.await(10, TimeUnit.SECONDS);
		}

		/** Lets the model write the second half and finish the turn. */
		public void release() {
			released.countDown();
		}

		private void hold() {
			entered.countDown();
			try {
				released.await(10, TimeUnit.SECONDS);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
		}

	}

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private final List<Asked> asked = Collections.synchronizedList(new ArrayList<>());

	private final List<Conversed> conversed = Collections.synchronizedList(new ArrayList<>());

	private final Deque<Turn> script = new ArrayDeque<>();

	private volatile String answer = "{}";

	private volatile long inputTokens = 1_000;

	private volatile long outputTokens = 100;

	private volatile Failure.Kind failing;

	private volatile Gate gate;

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
		return new Turn(turn.blocks(), turn.stopReason(), input, output, turn.webSearches(), turn.webSources());
	}

	/** The same turn with the provider's web searches and the pages it retrieved. */
	public static Turn web(Turn turn, long searches, List<Model.WebSource> sources) {
		return new Turn(turn.blocks(), turn.stopReason(), turn.inputTokens(), turn.outputTokens(), searches, sources);
	}

	public void answer(String json) {
		this.answer = json;
	}

	public void tokens(long input, long output) {
		this.inputTokens = input;
		this.outputTokens = output;
	}

	/** Every call fails like an unreachable provider, or stops failing with false. */
	public void setDown(boolean down) {
		this.failing = down ? Failure.Kind.UNAVAILABLE : null;
	}

	/** Every call fails with this kind of failure (OUT_OF_CREDIT or UNAVAILABLE) until cleared. */
	public void failWith(Failure.Kind kind) {
		this.failing = kind;
	}

	/** Holds the next scripted turn that has text (see {@link Gate}). */
	public Gate gateNextText() {
		gate = new Gate();
		return gate;
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
		failing = null;
		gate = null;
	}

	@Override
	public Reply ask(String system, String data, Map<String, Object> schema, long maxTokens) {
		asked.add(new Asked(system, data));
		if (failing != null) {
			throw new Failure(failing, "down");
		}
		return new Reply(answer, inputTokens, outputTokens);
	}

	/** The key check is the fake provider's own rule (FakeModel), not this stand-in's, so there is nothing to check here. */
	@Override
	public void check() {
	}

	@Override
	public Turn converse(String system, List<Message> messages, List<ToolSpec> tools, Consumer<String> onText, long maxTokens) {
		conversed.add(new Conversed(system, List.copyOf(messages), List.copyOf(tools)));
		if (failing != null) {
			throw new Failure(failing, "down");
		}
		var turn = next();
		var held = gate;
		gate = null;
		for (var block : turn.blocks()) {
			if (block instanceof ContentBlock.Text text) {
				if (held == null) {
					onText.accept(text.text());
				}
				else {
					var half = text.text().length() / 2;
					onText.accept(text.text().substring(0, half));
					held.hold();
					onText.accept(text.text().substring(half));
				}
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
