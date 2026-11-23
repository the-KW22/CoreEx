package com.coreex.ai;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Consumer;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.common.ApiException;

/**
 * Runs one model call for a User on the Shared key: refused when AI is off or today's budget is spent, counted against
 * the budget from the tokens the provider reports (even when the answer turns out to be unusable, since it was paid
 * for), and failures become stable error codes the screens can show. What the model answers is the caller's to check.
 */
@Service
public class AiService {

	private final Model model;

	private final AiBudget budget;

	private final AiSettings settings;

	AiService(Model model, AiBudget budget, AiSettings settings) {
		this.model = model;
		this.budget = budget;
		this.settings = settings;
	}

	/** Whether AI is switched on (a key or the fake provider is set, and an Admin has not switched it off). */
	public boolean available() {
		return settings.on();
	}

	/** Refuses with AI_OFF when AI is not switched on, by the key or by an Admin. Nothing is sent anywhere then. */
	public void requireOn() {
		if (!settings.on()) {
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_OFF",
					"AI is not switched on for this CoreEx. You can fill the fields in by hand.");
		}
	}

	/** Refuses with AI_BUDGET_SPENT when the User's Daily AI budget is used up for today. */
	public void requireRoom(UUID ownerId) {
		budget.requireRoom(ownerId);
	}

	/** Counts one model call against the User's budget at the chosen model's prices. Call it after every call. */
	public void record(UUID ownerId, long inputTokens, long outputTokens) {
		budget.record(ownerId, costMicroUsd(inputTokens, outputTokens));
	}

	/** One turn of a conversation on the Shared key. Provider failures come out as Model.Failure for the caller to map. */
	public Model.Turn converse(String system, List<Model.Message> messages, List<Model.ToolSpec> tools,
			Consumer<String> onText, long maxTokens) {
		return model.converse(system, messages, tools, onText, maxTokens);
	}

	/** The answer's JSON text. */
	public String ask(UUID ownerId, String system, String data, Map<String, Object> schema) {
		return askWithUse(ownerId, system, data, schema).text();
	}

	/** The answer's JSON text with the tokens the provider reported, for results that record their model use. */
	public Model.Reply askWithUse(UUID ownerId, String system, String data, Map<String, Object> schema) {
		requireOn();
		budget.requireRoom(ownerId);
		Model.Reply reply;
		try {
			reply = model.ask(system, data, schema, settings.maxOutputTokens());
		}
		catch (Model.Failure e) {
			throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_UNAVAILABLE",
					"The AI service could not answer just now. Try again, or fill the fields in by hand.");
		}
		budget.record(ownerId, costMicroUsd(reply.inputTokens(), reply.outputTokens()));
		return reply;
	}

	/**
	 * What a model call cost, in millionths of a dollar, from the tokens the provider reported and the chosen model's
	 * prices. Turns of a conversation are charged through this too.
	 * shortcut: cache reads and writes are charged at the plain input price, not their discounts, so a long cached Chat
	 * is billed above its real cost. Upgrade by passing the cache tokens separately once their prices are in the model list.
	 */
	public long costMicroUsd(long inputTokens, long outputTokens) {
		var price = settings.current().model();
		return Math.round(inputTokens * price.inputUsdPerMillion() + outputTokens * price.outputUsdPerMillion());
	}

}
