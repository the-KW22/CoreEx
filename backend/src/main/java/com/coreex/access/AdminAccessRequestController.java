package com.coreex.access;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;

import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

/** Admins turn Access requests into Invites. Only the email and the date are shown (ADR 0004), enforced as ROLE_ADMIN. */
@RestController
@RequestMapping(value = "/api/admin/access-requests", produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('ADMIN')")
class AdminAccessRequestController {

	private static final int MAX_PAGE_SIZE = 100;

	record AccessRequestResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String email,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt) {
	}

	record AccessRequestPage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<AccessRequestResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	private final AccessRequestService service;

	AdminAccessRequestController(AccessRequestService service) {
		this.service = service;
	}

	/** The open requests, newest first. */
	@GetMapping
	AccessRequestPage list(@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		var safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
		var items = service.listOpen(Math.max(0, page), safeSize).stream()
				.map(r -> new AccessRequestResponse(r.id(), r.email(), r.createdAt())).toList();
		return new AccessRequestPage(items, service.totalOpen());
	}

	@PostMapping("/{id}/invite")
	@ApiResponse(responseCode = "200", description = "The Invite was made and the request closed")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code REQUEST_NOT_OPEN or USER_EXISTS", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	void invite(@PathVariable UUID id) {
		service.invite(id);
	}

	@PostMapping("/{id}/dismiss")
	@ApiResponse(responseCode = "200", description = "The request was closed without an Invite")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code REQUEST_NOT_OPEN", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	void dismiss(@PathVariable UUID id) {
		service.dismiss(id);
	}

}
