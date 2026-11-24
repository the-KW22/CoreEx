package com.coreex.ai;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ApiException;
import com.coreex.common.ErrorBody;

import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * The Admin Chat card: the Shared key's switch, model and Daily AI budget. They are settings and prices only: this
 * returns no Chat, no count of Chats and no User's spending (ADR 0004). Enforced as ROLE_ADMIN, not only hidden in the UI.
 */
@RestController
@RequestMapping(value = "/api/admin/chat-settings", produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('ADMIN')")
class AiSettingsController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record ModelOption(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Dollars per million input tokens") double inputUsdPerMillion,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Dollars per million output tokens") double outputUsdPerMillion) {
	}

	record ChatSettings(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Shared key's switch: off refuses every new AI call, Chat and Career alike") boolean enabled,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The id of the model in use, one of models") String model,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Dollars per User per UTC day") double dailyBudgetUsd,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The models an Admin can pick, with their prices") List<ModelOption> models,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "False when the server has no key: AI is then off whatever the switch says") boolean keyConfigured) {
	}

	/** Every field is required, so a misspelled one is a 400 and never a silent reset. */
	record UpdateRequest(@NotNull Boolean enabled, @NotBlank String model,
			@Schema(description = "Dollars per User per UTC day, 0 to 100") @NotNull @DecimalMin("0") @DecimalMax("100") Double dailyBudgetUsd) {
	}

	private final AiSettings settings;

	AiSettingsController(AiSettings settings) {
		this.settings = settings;
	}

	@GetMapping
	ChatSettings get() {
		return view();
	}

	@PutMapping(consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The settings now in force", content = @Content(mediaType = JSON, schema = @Schema(implementation = ChatSettings.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST: a model that is not in the list, or a budget outside 0 to 100 dollars",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ChatSettings update(@Valid @RequestBody UpdateRequest request) {
		if (settings.models().stream().noneMatch(m -> m.id().equals(request.model()))) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "That model is not in the list.");
		}
		settings.update(request.enabled(), request.model(), Math.round(request.dailyBudgetUsd() * 1_000_000));
		return view();
	}

	private ChatSettings view() {
		var current = settings.current();
		return new ChatSettings(current.enabled(), current.model().id(), current.dailyBudgetMicroUsd() / 1_000_000.0,
				settings.models().stream().map(m -> new ModelOption(m.id(), m.name(), m.inputUsdPerMillion(), m.outputUsdPerMillion())).toList(),
				settings.keyConfigured());
	}

}
