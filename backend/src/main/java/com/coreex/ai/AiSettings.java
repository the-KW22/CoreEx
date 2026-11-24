package com.coreex.ai;

import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import com.coreex.ai.AiProperties.ModelPrice;

/**
 * What an Admin can change about the Shared key without a redeploy: on or off, the model and the Daily AI budget. They
 * are read from the database on every call, so a change takes effect at once; an unset model or budget is the configured
 * default ({@link AiProperties}). The key itself is never here.
 */
@Component
public class AiSettings {

	/** The settings in force: the model is always one of the configured list, the budget is in millionths of a dollar. */
	record Current(boolean enabled, ModelPrice model, long dailyBudgetMicroUsd) {
	}

	private final JdbcClient jdbc;

	private final AiProperties properties;

	AiSettings(JdbcClient jdbc, AiProperties properties) {
		this.jdbc = jdbc;
		this.properties = properties;
	}

	Current current() {
		return jdbc.sql("select enabled, model, daily_budget_micro_usd from ai_settings").query((rs, i) -> {
			var budget = rs.getObject("daily_budget_micro_usd", Long.class);
			return new Current(rs.getBoolean("enabled"), priceOf(rs.getString("model")),
					budget != null ? budget : Math.round(properties.dailyBudgetUsd() * 1_000_000));
		}).single();
	}

	/** Whether AI is on: a key (or the fake provider) is set and an Admin has not switched it off. */
	boolean on() {
		return properties.on() && current().enabled();
	}

	/** Whether the server has a key (or the fake provider), whatever the Admin's switch says. */
	boolean keyConfigured() {
		return properties.on();
	}

	List<ModelPrice> models() {
		return properties.models();
	}

	long maxOutputTokens() {
		return properties.maxOutputTokens();
	}

	/** A stored model that is no longer in the list (it was removed from the settings) falls back to the default. */
	private ModelPrice priceOf(String id) {
		return properties.models().stream().filter(m -> m.id().equals(id)).findFirst()
				.or(() -> properties.models().stream().filter(m -> m.id().equals(properties.model())).findFirst())
				.orElse(properties.models().get(0));
	}

	/** The caller has checked that {@code model} is in the list. */
	void update(boolean enabled, String model, long dailyBudgetMicroUsd) {
		jdbc.sql("""
				update ai_settings set enabled = :enabled, model = :model, daily_budget_micro_usd = :budget,
				updated_at = now()""").param("enabled", enabled).param("model", model).param("budget", dailyBudgetMicroUsd)
				.update();
	}

}
