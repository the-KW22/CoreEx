package com.coreex.ai;

import java.util.Map;
import java.util.stream.Collectors;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.JsonValue;
import com.anthropic.models.messages.JsonOutputFormat;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;

/** Claude, on the Shared key, through the official Java SDK. The key never leaves the backend. */
class AnthropicModel implements Model {

	private final String model;

	private final AnthropicClient client;

	AnthropicModel(AiProperties properties) {
		this.model = properties.model();
		var builder = AnthropicOkHttpClient.builder().apiKey(properties.apiKey());
		if (!properties.baseUrl().isBlank()) {
			builder.baseUrl(properties.baseUrl());
		}
		this.client = builder.build();
	}

	@Override
	public Reply ask(String system, String data, Map<String, Object> schema, long maxTokens) {
		try {
			var shape = JsonOutputFormat.Schema.builder();
			schema.forEach((name, value) -> shape.putAdditionalProperty(name, JsonValue.from(value)));
			var params = MessageCreateParams.builder().model(model).maxTokens(maxTokens).system(system)
					.outputConfig(OutputConfig.builder().format(JsonOutputFormat.builder().schema(shape.build()).build()).build())
					.addUserMessage(data).build();
			var response = client.messages().create(params);
			var text = response.content().stream().flatMap(block -> block.text().stream()).map(t -> t.text())
					.collect(Collectors.joining());
			return new Reply(text, response.usage().inputTokens(), response.usage().outputTokens());
		}
		catch (RuntimeException e) {
			throw new Failure(e);
		}
	}

}
