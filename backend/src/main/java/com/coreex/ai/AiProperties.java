package com.coreex.ai;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The Shared key and what it may spend (ADR 0009). {@code provider} is "anthropic" (the default), "fake" (fixed answers,
 * for the end-to-end tests) or "off". With no key the provider is as good as off: nothing is sent anywhere.
 * {@code dailyBudgetUsd} is per User per UTC day; the prices are dollars per million tokens, for the chosen model.
 * shortcut: the Admin page's on/off switch, model picker and budget field come with Chat (#113); until then these are
 * settings of the API.
 */
@ConfigurationProperties("coreex.ai")
record AiProperties(@DefaultValue("anthropic") String provider, @DefaultValue("") String apiKey,
		@DefaultValue("claude-opus-5-5") String model, @DefaultValue("") String baseUrl,
		@DefaultValue("0.50") double dailyBudgetUsd, @DefaultValue("4.0") double inputUsdPerMillion,
		@DefaultValue("20.0") double outputUsdPerMillion, @DefaultValue("16000") long maxOutputTokens) {

	boolean on() {
		return provider.equals("fake") || (provider.equals("anthropic") && !apiKey.isBlank());
	}

}
