package com.coreex.invites;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;

import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Admins manage Invites; no Item content is exposed here (ADR 0004). Enforced as ROLE_ADMIN, not only hidden in the UI. */
@RestController
@RequestMapping(value = "/api/admin/invites", produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('ADMIN')")
class AdminInviteController {

	private static final int MAX_PAGE_SIZE = 100;

	record CreateInviteRequest(@NotBlank @Email @Size(max = 254) String email) {

		// Pasted emails often carry spaces; trim before validation.
		CreateInviteRequest {
			email = email == null ? null : email.trim();
		}

	}

	record InviteResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String email,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Invite.Status status,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt, Instant acceptedAt) {

		static InviteResponse of(Invite invite) {
			return new InviteResponse(invite.id(), invite.email(), invite.status(), invite.createdAt(),
					invite.acceptedAt());
		}

	}

	record InvitePage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<InviteResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	private final InviteService invites;

	AdminInviteController(InviteService invites) {
		this.invites = invites;
	}

	@GetMapping
	InvitePage list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		var safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
		var items = invites.list(Math.max(0, page), safeSize).stream().map(InviteResponse::of).toList();
		return new InvitePage(items, invites.total());
	}

	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The new Invite", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = InviteResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code USER_EXISTS or INVITE_EXISTS", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	InviteResponse create(@Valid @RequestBody CreateInviteRequest request) {
		return InviteResponse.of(invites.create(request.email()));
	}

	@PostMapping("/{id}/revoke")
	@ApiResponse(responseCode = "200", description = "The revoked Invite", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = InviteResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code INVITE_NOT_PENDING", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	InviteResponse revoke(@PathVariable UUID id) {
		return InviteResponse.of(invites.revoke(id));
	}

}
