package com.coreex.ai;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ApiException;
import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A User's own AI settings (issue #203): the model their Chats use and their own key. The key is write-only: it is
 * checked with the provider on save, stored sealed, and never returned, only its provider and last four characters.
 * Every call is for the signed-in User alone (ADR 0004 keeps the Admin out as well).
 */
@RestController
@RequestMapping(value = "/api/ai", produces = MediaType.APPLICATION_JSON_VALUE)
class AiPreferencesController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	private static final String ANTHROPIC = "anthropic";

	record KeyView(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The provider the key is for: anthropic") String provider,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The last four characters of the key, the only part ever shown") String last4) {
	}

	record Preferences(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The model in force for this User's Chats") String model,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The models a User may pick, with their prices") List<AiSettingsController.ModelOption> models,
			@Schema(description = "This User's own key, or null when none is stored") KeyView key,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "False when the server has no vault secret, so keys cannot be stored") boolean keysAvailable) {
	}

	record ModelRequest(@NotBlank String model) {
	}

	/** The key is trimmed before it is checked and stored; it is never echoed back. */
	record KeyRequest(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The provider: only anthropic") String provider,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The key, up to 400 characters") @NotBlank @Size(max = 400) String key) {
	}

	private final AiSettings settings;

	private final UserAi userAi;

	private final AiKeyVault vault;

	private final AiService ai;

	AiPreferencesController(AiSettings settings, UserAi userAi, AiKeyVault vault, AiService ai) {
		this.settings = settings;
		this.userAi = userAi;
		this.vault = vault;
		this.ai = ai;
	}

	@GetMapping("/preferences")
	Preferences get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return view(user.id());
	}

	@PutMapping(value = "/preferences/model", consumes = JSON)
	@ApiResponse(responseCode = "400", description = "Code UNKNOWN_MODEL: the model is not in the list",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	Preferences pickModel(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody ModelRequest request) {
		if (settings.models().stream().noneMatch(m -> m.id().equals(request.model()))) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "UNKNOWN_MODEL", "That model is not in the list.");
		}
		userAi.setChatModel(user.id(), request.model());
		return view(user.id());
	}

	@PutMapping(value = "/key", consumes = JSON)
	@ApiResponse(responseCode = "400", description = "Code UNKNOWN_PROVIDER: the provider is not anthropic. Code KEY_REJECTED: the provider did not accept the key",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "503", description = "Code KEYS_OFF: the server has no vault secret, so keys cannot be stored",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	Preferences saveKey(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody KeyRequest request) {
		if (!ANTHROPIC.equals(request.provider())) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "UNKNOWN_PROVIDER", "Only Anthropic keys can be saved.");
		}
		if (!vault.available()) {
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "KEYS_OFF", "Keys cannot be stored on this CoreEx.");
		}
		var key = request.key().strip();
		try {
			ai.checkKey(key);
		}
		catch (Model.Failure e) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "KEY_REJECTED", "The provider did not accept this key.");
		}
		userAi.saveKey(user.id(), ANTHROPIC, vault.encrypt(key), key.substring(Math.max(0, key.length() - 4)));
		return view(user.id());
	}

	/** Removes the key; the chosen model stays. */
	@DeleteMapping("/key")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteKey(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		userAi.deleteKey(user.id());
	}

	private Preferences view(UUID owner) {
		var key = userAi.saved(owner).map(s -> new KeyView(s.provider(), s.last4())).orElse(null);
		return new Preferences(userAi.resolve(owner).model().id(),
				settings.models().stream().map(m -> new AiSettingsController.ModelOption(m.id(), m.name(), m.inputUsdPerMillion(), m.outputUsdPerMillion())).toList(),
				key, vault.available());
	}

}
