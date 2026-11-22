package com.coreex.ai;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
class AiConfiguration {

	/** The provider the settings name; nothing is built (and no key is read) when AI is off. */
	@Bean
	Model model(AiProperties properties) {
		if (properties.provider().equals("fake")) {
			return new FakeModel();
		}
		if (properties.on()) {
			return new AnthropicModel(properties);
		}
		return new OffModel();
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

	}

}
