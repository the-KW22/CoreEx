package com.coreex.ai;

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
		return (system, data, schema, maxTokens) -> {
			throw new Model.Failure("AI is off");
		};
	}

}
