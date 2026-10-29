package com.coreex.admin;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

/**
 * Users, quotas and the overview for Admins. Account facts and totals only: no Note, Asset, Folder or Tag content and
 * no Storage links (ADR 0004). Enforced as ROLE_ADMIN, not only hidden in the UI.
 */
@RestController
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('ADMIN')")
class AdminUserController {

	private static final int MAX_PAGE_SIZE = 100;

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	/** Required, so a misspelled field is a 400 and never a silent reset: use DELETE to go back to the default. */
	record SetQuotaRequest(
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Bytes, 0 to 1 TB") @NotNull @PositiveOrZero @Max(1_000_000_000_000L) Long storageQuotaBytes) {
	}

	record UserResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String email,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) User.Role role,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) User.Status status,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) Instant lastActiveAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Live Items (Notes and Assets)") long itemCount,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Bytes of READY Assets, Assets in the Trash included") long storageUsedBytes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The quota that applies: the custom one or the default") long storageQuotaBytes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "True when an Admin set this User's quota") boolean customQuota) {

		static UserResponse of(AdminUserService.UserSummary user) {
			return new UserResponse(user.id(), user.email(), user.role(), user.status(), user.createdAt(),
					user.lastActiveAt(), user.itemCount(), user.storageUsedBytes(), user.storageQuotaBytes(),
					user.customQuota());
		}

	}

	record UserPage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<UserResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	record OverviewResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long totalUsers,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long disabledUsers,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Bytes of READY Assets of all Users, Trash included") long storageUsedBytes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The storage the hosting plan allows (1 GiB on the Supabase free tier)") long hostingLimitBytes) {
	}

	private final AdminUserService users;

	AdminUserController(AdminUserService users) {
		this.users = users;
	}

	@GetMapping("/api/admin/users")
	UserPage list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		var safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
		var items = users.list(Math.max(0, page), safeSize).stream().map(UserResponse::of).toList();
		return new UserPage(items, users.total());
	}

	@PutMapping(value = "/api/admin/users/{id}/quota", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The User with the new quota", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = UserResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	UserResponse setQuota(@PathVariable UUID id, @Valid @RequestBody SetQuotaRequest request) {
		return UserResponse.of(users.setQuota(id, request.storageQuotaBytes()));
	}

	/** Takes the custom quota away, so the configured default applies again. */
	@DeleteMapping("/api/admin/users/{id}/quota")
	@ApiResponse(responseCode = "200", description = "The User on the default quota", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = UserResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	UserResponse resetQuota(@PathVariable UUID id) {
		return UserResponse.of(users.setQuota(id, null));
	}

	/** Blocks the User from their next request on. Their data is kept. */
	@PostMapping("/api/admin/users/{id}/disable")
	@ApiResponse(responseCode = "200", description = "The disabled User", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = UserResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code CANNOT_DISABLE_SELF", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	UserResponse disable(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User admin,
			@PathVariable UUID id) {
		return UserResponse.of(users.disable(admin.id(), id));
	}

	@PostMapping("/api/admin/users/{id}/enable")
	@ApiResponse(responseCode = "200", description = "The enabled User", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = UserResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	UserResponse enable(@PathVariable UUID id) {
		return UserResponse.of(users.enable(id));
	}

	/** Deletes the User's data, files and sign-in so the email can be invited again. */
	@DeleteMapping("/api/admin/users/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "The User and everything of theirs is gone")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code CANNOT_REMOVE_ADMIN", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "503", description = "Code STORAGE_UNAVAILABLE or AUTH_UNAVAILABLE; nothing was lost, retry",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void remove(@PathVariable UUID id) {
		users.remove(id);
	}

	@GetMapping("/api/admin/overview")
	OverviewResponse overview() {
		var overview = users.overview();
		return new OverviewResponse(overview.totalUsers(), overview.disabledUsers(), overview.storageUsedBytes(),
				overview.hostingLimitBytes());
	}

}
