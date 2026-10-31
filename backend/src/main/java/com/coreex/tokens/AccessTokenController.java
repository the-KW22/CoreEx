package com.coreex.tokens;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A User's own Access tokens. Admins get no view of them (ADR 0004). */
@RestController
@RequestMapping(value = "/api/access-tokens", produces = MediaType.APPLICATION_JSON_VALUE)
class AccessTokenController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record CreateTokenRequest(@NotBlank @Size(max = 60) String name,
			@Schema(description = "Days until it expires; absent means the default (90)") @Min(1) @Max(3650) Integer expiresInDays,
			@Schema(description = "True for a token that never expires") Boolean neverExpires) {

		CreateTokenRequest {
			name = name == null ? null : name.trim();
		}

	}

	record TokenResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(nullable = true) Instant lastUsedAt, @Schema(nullable = true) Instant expiresAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Its expiry has passed, so it no longer works") boolean expired) {

		static TokenResponse of(AccessToken token, Instant now) {
			return new TokenResponse(token.id(), token.name(), token.createdAt(), token.lastUsedAt(), token.expiresAt(),
					token.expiresAt() != null && !token.expiresAt().isAfter(now));
		}

	}

	record CreatedTokenResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(nullable = true) Instant lastUsedAt, @Schema(nullable = true) Instant expiresAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The secret. It is shown only now.") String token) {
	}

	record TokenList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<TokenResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	private final AccessTokenService tokens;

	private final Clock clock;

	AccessTokenController(AccessTokenService tokens, Clock clock) {
		this.tokens = tokens;
		this.clock = clock;
	}

	@GetMapping
	TokenList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		var items = tokens.list(user.id()).stream().map(t -> TokenResponse.of(t, clock.instant())).toList();
		return new TokenList(items, items.size());
	}

	@PostMapping(consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The new Access token, with its secret", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = CreatedTokenResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code TOKEN_LIMIT: the User has too many live Access tokens",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	CreatedTokenResponse create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody CreateTokenRequest request) {
		var created = tokens.create(user.id(), request.name(), request.expiresInDays(), Boolean.TRUE.equals(request.neverExpires()));
		var token = created.token();
		return new CreatedTokenResponse(token.id(), token.name(), token.createdAt(), token.lastUsedAt(),
				token.expiresAt(), created.secret());
	}

	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Revoked")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's token)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void revoke(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		tokens.revoke(user.id(), id);
	}

}
