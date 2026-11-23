package com.coreex.ai;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.function.Function;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.ai.AiProperties.ModelPrice;
import com.coreex.common.ApiException;

/**
 * Runs one model call for a User. A User with their own key (ADR 0009, issue #203) is charged nothing, is never refused
 * by the Shared key's switch or budget, and is never mixed with the Shared key. Otherwise the call uses the Shared key,
 * is refused when AI is off or today's budget is spent, and is counted from the tokens the provider reports (even when
 * the answer turns out to be unusable, since it was paid for). Failures become stable error codes the screens can show.
 * Chat turns use the User's chosen model; Career calls use the Admin's model.
 */
@Service
public class AiService {

	private final AiProperties properties;

	private final AiBudget budget;

	private final AiSettings settings;

	private final UserAi userAi;

	/** The fake provider's model (or a test's stand-in for it). */
	private final Model model;

	/** One Shared-key client per model id, so the model is fixed for each instance. */
	private final Map<String, AnthropicModel> shared = new ConcurrentHashMap<>();

	AiService(AiProperties properties, AiBudget budget, AiSettings settings, UserAi userAi, Model model) {
		this.properties = properties;
		this.budget = budget;
		this.settings = settings;
		this.userAi = userAi;
		this.model = model;
	}

	/** Whether AI works for this User: with their own key, or while an Admin has not switched the Shared key off. */
	public boolean available(UUID ownerId) {
		return hasOwnKey(ownerId) || settings.on();
	}

	/** Whether this User has an own key that can be used. */
	public boolean hasOwnKey(UUID ownerId) {
		return ownKey(ownerId).isPresent();
	}

	/** Refuses with AI_OFF when AI does not work for this User. Nothing is sent anywhere then. */
	public void requireOn(UUID ownerId) {
		if (!available(ownerId)) {
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AI_OFF",
					"AI is not switched on for this CoreEx. You can fill the fields in by hand.");
		}
	}

	/** Refuses with AI_BUDGET_SPENT when the User's Daily AI budget is used up. An own key is never refused here. */
	public void requireRoom(UUID ownerId) {
		if (!hasOwnKey(ownerId)) {
			budget.requireRoom(ownerId);
		}
	}

	/**
	 * Counts one Chat call against the User's budget at their chosen model's prices. Call it after every call.
	 * shortcut: the key is looked up again here, so a key removed while a turn runs makes that turn count; upgrade by carrying the route from the call to the count.
	 */
	public void record(UUID ownerId, long inputTokens, long outputTokens) {
		var route = userAi.resolve(ownerId);
		charge(ownerId, route.ownKey(), route.model(), inputTokens, outputTokens);
	}

	/** One turn of a conversation at the User's chosen model, on their own key when they have one. */
	public Model.Turn converse(UUID ownerId, String system, List<Model.Message> messages, List<Model.ToolSpec> tools,
			Consumer<String> onText, long maxTokens) {
		var route = userAi.resolve(ownerId);
		return call(route.ownKey(), route.model().id(), m -> m.converse(system, messages, tools, onText, maxTokens));
	}

	/** The answer's JSON text. */
	public String ask(UUID ownerId, String system, String data, Map<String, Object> schema) {
		return askWithUse(ownerId, system, data, schema).text();
	}

	/** The answer's JSON text with the tokens the provider reported, for results that record their model use. */
	public Model.Reply askWithUse(UUID ownerId, String system, String data, Map<String, Object> schema) {
		requireOn(ownerId);
		requireRoom(ownerId);
		var ownKey = ownKey(ownerId);
		var price = settings.current().model();
		Model.Reply reply;
		try {
			reply = call(ownKey, price.id(), m -> m.ask(system, data, schema, settings.maxOutputTokens()));
		}
		catch (Model.Failure e) {
			throw new ApiException(HttpStatus.BAD_GATEWAY, "AI_UNAVAILABLE",
					"The AI service could not answer just now. Try again, or fill the fields in by hand.");
		}
		charge(ownerId, ownKey, price, reply.inputTokens(), reply.outputTokens());
		return reply;
	}

	/**
	 * Checks a key the User wants to save with one tiny call to the provider. Throws Model.Failure when it is refused.
	 * The fake provider checks by its own rule, so a test can save a key the provider refuses.
	 */
	public void checkKey(String key) {
		if (properties.provider().equals("fake")) {
			new FakeModel(key).check();
			return;
		}
		try (var model = new AnthropicModel(properties, key, settings.current().model().id(), properties.ownKeyContextClearTokens())) {
			model.check();
		}
	}

	/**
	 * What a call cost on the Admin's model, in millionths of a dollar, from the tokens the provider reported.
	 * shortcut: cache reads and writes are charged at the plain input price, not their discounts, so a long cached Chat
	 * is billed above its real cost. Upgrade by passing the cache tokens separately once their prices are in the model list.
	 */
	public long costMicroUsd(long inputTokens, long outputTokens) {
		return cost(settings.current().model(), inputTokens, outputTokens);
	}

	private Optional<String> ownKey(UUID ownerId) {
		return userAi.resolve(ownerId).ownKey();
	}

	/** Counts a call against the budget unless it ran on the User's own key. */
	private void charge(UUID ownerId, Optional<String> ownKey, ModelPrice price, long inputTokens, long outputTokens) {
		if (ownKey.isEmpty()) {
			budget.record(ownerId, cost(price, inputTokens, outputTokens));
		}
	}

	private static long cost(ModelPrice price, long inputTokens, long outputTokens) {
		return Math.round(inputTokens * price.inputUsdPerMillion() + outputTokens * price.outputUsdPerMillion());
	}

	/**
	 * Runs one call on the right model: the fake provider's, a fresh one on the User's own key (closed after the call), or
	 * the Shared key's one for the model. Never mixes the two keys.
	 */
	private <T> T call(Optional<String> ownKey, String modelId, Function<Model, T> use) {
		if (properties.provider().equals("fake")) {
			return use.apply(model);
		}
		if (ownKey.isPresent()) {
			// shortcut: a new SDK client (and connection pool) for every own-key call, so a busy User opens many sockets, upgrade by caching a client per key for a few minutes.
			try (var own = new AnthropicModel(properties, ownKey.get(), modelId, properties.ownKeyContextClearTokens())) {
				return use.apply(own);
			}
		}
		if (!properties.on()) {
			throw new Model.Failure("AI is off");
		}
		return use.apply(shared.computeIfAbsent(modelId,
				id -> new AnthropicModel(properties, properties.apiKey(), id, properties.contextClearTokens())));
	}

}
