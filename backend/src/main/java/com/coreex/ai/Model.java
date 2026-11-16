package com.coreex.ai;

import java.util.Map;

/**
 * The one small interface to a language model (ADR 0009): another provider is another class behind it. The caller gives
 * the instructions ({@code system}), the text to work on ({@code data}, which is data and never instructions to the
 * model) and the JSON schema the answer must have; it gets the answer's JSON text and the tokens the provider reports.
 */
public interface Model {

	record Reply(String text, long inputTokens, long outputTokens) {
	}

	Reply ask(String system, String data, Map<String, Object> schema, long maxTokens);

	/** The provider could not answer: unreachable, out of credit, refused, or an error. The cause is never shown. */
	class Failure extends RuntimeException {

		public Failure(Throwable cause) {
			super("The model could not answer", cause);
		}

		public Failure(String message) {
			super(message);
		}

	}

}
