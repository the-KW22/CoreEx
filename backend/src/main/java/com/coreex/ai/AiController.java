package com.coreex.ai;

import java.time.Instant;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;

@RestController
@RequestMapping(value = "/api/ai", produces = MediaType.APPLICATION_JSON_VALUE)
class AiController {

	record Status(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "False until the owner sets the Shared key, or while an Admin has switched it off: AI features then show as pending") boolean available) {
	}

	record Usage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What this User has used today (UTC), in dollars") double spentUsd,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Daily AI budget, in dollars") double budgetUsd,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "When the budget starts again: the next midnight UTC") Instant resetsAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "False when AI is off for this User, by the Shared key or by an Admin") boolean available,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "True when this User uses their own key, which is not counted in the budget") boolean ownKey) {
	}

	private final AiService ai;

	private final AiBudget budget;

	AiController(AiService ai, AiBudget budget) {
		this.ai = ai;
		this.budget = budget;
	}

	@GetMapping("/status")
	Status status(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return new Status(ai.available(user.id()));
	}

	/** Only the signed-in User's own spending: the budget is per User, and nobody else's is ever shown. */
	@GetMapping("/usage")
	Usage usage(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return new Usage(budget.spentToday(user.id()) / 1_000_000.0, budget.budgetMicroUsd() / 1_000_000.0, budget.resetsAt(),
				ai.available(user.id()), ai.hasOwnKey(user.id()));
	}

}
