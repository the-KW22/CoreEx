package com.coreex.ai;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The Shared key and what it may spend (ADR 0009). {@code provider} is "anthropic" (the default), "fake" (fixed answers,
 * for the end-to-end tests) or "off". With no key the provider is as good as off: nothing is sent anywhere.
 * {@code model} and {@code dailyBudgetUsd} (per User per UTC day) are the defaults; an Admin changes them on the Admin
 * page and the database then wins ({@link AiSettings}). {@code models} is the list an Admin picks from, with each model's
 * prices in dollars per million tokens.
 * {@code contextClearTokens} is the conversation size past which the provider clears its oldest tool results (ADR 0009);
 * 0 turns that off. {@code keySecret} seals Users' own keys ({@link AiKeyVault}); without it nobody can store one.
 * {@code ownKeyContextClearTokens} is the same threshold for a User's own key, which is allowed a longer context.
 * shortcut: prices are set by hand here, so they must be updated when the provider changes them, and the higher price of
 * Haiku 5.5 for prompts over 100K tokens is not modelled. Upgrade by reading the prices from the provider.
 */
@ConfigurationProperties("coreex.ai")
record AiProperties(@DefaultValue("anthropic") String provider, @DefaultValue("") String apiKey,
		@DefaultValue("claude-opus-5-5") String model, @DefaultValue("") String baseUrl,
		@DefaultValue("0.50") double dailyBudgetUsd, @DefaultValue("16000") long maxOutputTokens,
		@DefaultValue("100000") long contextClearTokens, List<ModelPrice> models,
		@DefaultValue("") String keySecret, @DefaultValue("300000") long ownKeyContextClearTokens) {

	/** One model an Admin may pick, and what it costs. */
	record ModelPrice(String id, String name, double inputUsdPerMillion, double outputUsdPerMillion) {
	}

	private static final List<ModelPrice> DEFAULT_MODELS = List.of(
			new ModelPrice("claude-opus-5-5", "Claude Opus 5.5", 4.0, 20.0),
			new ModelPrice("claude-sonnet-5-5", "Claude Sonnet 5.5", 2.0, 10.0),
			new ModelPrice("claude-haiku-5-5", "Claude Haiku 5.5", 0.10, 0.50));

	AiProperties {
		models = models == null || models.isEmpty() ? DEFAULT_MODELS : List.copyOf(models);
	}

	boolean on() {
		return provider.equals("fake") || (provider.equals("anthropic") && !apiKey.isBlank());
	}

}
