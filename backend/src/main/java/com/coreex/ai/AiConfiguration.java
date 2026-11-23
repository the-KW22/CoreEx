package com.coreex.ai;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class AiConfiguration {

	/**
	 * The fake provider's model for the end-to-end tests. Anthropic is not built here: AiService makes its clients, one
	 * per model for the Shared key and one per call for a User's own key. Nothing is built, and no key is read, when AI is off.
	 */
	@Bean
	Model model(AiProperties properties) {
		return properties.provider().equals("fake") ? new FakeModel("") : new OffModel();
	}

	/** AI is switched off: every call fails at once, and nothing is sent anywhere. */
	private static class OffModel implements Model {

		@Override
		public Reply ask(String system, String data, Map<String, Object> schema, long maxTokens) {
			throw new Failure("AI is off");
		}

		@Override
		public Turn converse(String system, List<Message> messages, List<ToolSpec> tools, Consumer<String> onText, long maxTokens) {
			throw new Failure("AI is off");
		}

		@Override
		public void check() {
			throw new Failure("AI is off");
		}

	}

}
