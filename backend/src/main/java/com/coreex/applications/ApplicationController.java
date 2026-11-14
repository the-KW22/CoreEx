package com.coreex.applications;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

import com.coreex.applications.Application.Stage;
import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping(value = "/api/applications", produces = MediaType.APPLICATION_JSON_VALUE)
class ApplicationController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	private static final int MAX_PAGE_SIZE = 100;

	private static final int MAX_NAME = 90;

	private static final int MAX_TITLE = 200;

	private static final int MAX_LOCATION = 200;

	private static final int MAX_URL = 2000;

	private static final int MAX_POSTING = 100_000;

	// Postgres cannot store a NUL character in text.
	private static final String NO_NUL = "[^\u0000]*";

	// Only a web address (or nothing), so the page can show it as a link without running anything.
	private static final String WEB_URL = "(?i)(https?://\\S*)?";

	record CreateApplicationRequest(@NotBlank @Size(max = MAX_NAME) @Pattern(regexp = NO_NUL) String company,
			@NotBlank @Size(max = MAX_NAME) @Pattern(regexp = NO_NUL) String role,
			@Size(max = MAX_LOCATION) @Pattern(regexp = NO_NUL) String location,
			@Size(max = MAX_URL) @Pattern(regexp = WEB_URL) String postingUrl,
			@Size(max = MAX_POSTING) @Pattern(regexp = NO_NUL) String postingText) {
	}

	/** Carries the version the client last saw; a newer stored version means 409 VERSION_CONFLICT. */
	record SaveApplicationRequest(
			@NotBlank @Size(max = MAX_TITLE) @Pattern(regexp = NO_NUL) @Schema(description = "The title as shown. Sending it back unchanged keeps the automatic Role at Company title; a different one renames the Application for good") String title,
			@NotBlank @Size(max = MAX_NAME) @Pattern(regexp = NO_NUL) String company,
			@NotBlank @Size(max = MAX_NAME) @Pattern(regexp = NO_NUL) String role,
			@NotNull @Size(max = MAX_LOCATION) @Pattern(regexp = NO_NUL) String location,
			@NotNull @Size(max = MAX_URL) @Pattern(regexp = WEB_URL) String postingUrl,
			@NotNull @Size(max = MAX_POSTING) @Pattern(regexp = NO_NUL) String postingText,
			@NotNull Integer version) {
	}

	record MoveStageRequest(@NotNull Stage stage, @NotNull Integer version) {
	}

	record TimelineEntryResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "STAGE for now") String type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Stage stage,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The display date, at 12:00 UTC") Instant at,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The order it was written in") int seq) {
	}

	record ApplicationResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String company,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String role,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String location,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String postingUrl,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String postingText,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Stage stage,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "When the Application first moved into Applied, at 12:00 UTC") Instant appliedOn,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<TimelineEntryResponse> timeline,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

		static ApplicationResponse of(Application a) {
			return new ApplicationResponse(a.id(), a.title(), a.company(), a.role(), a.location(), a.postingUrl(),
					a.postingText(), a.stage(), a.appliedOn(),
					a.timeline().stream().map(e -> new TimelineEntryResponse(e.type(), e.stage(), e.at(), e.seq())).toList(),
					a.version(), a.folderId(), a.createdAt(), a.updatedAt());
		}

	}

	record ApplicationPage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ApplicationResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	private final ApplicationService applications;

	ApplicationController(ApplicationService applications) {
		this.applications = applications;
	}

	@PostMapping(consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The new Application, in Saved", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody CreateApplicationRequest request) {
		return ApplicationResponse.of(applications.create(user.id(), request.company(), request.role(),
				orEmpty(request.location()), orEmpty(request.postingUrl()), orEmpty(request.postingText())));
	}

	/** The signed-in User's live Applications, most recently updated first. */
	@GetMapping
	@ApiResponse(responseCode = "200", description = "A page of Applications", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ApplicationPage.class)))
	ApplicationPage list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		var safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
		var found = applications.list(user.id(), Math.max(0, page), safeSize).stream().map(ApplicationResponse::of)
				.toList();
		return new ApplicationPage(found, applications.total(user.id()));
	}

	@GetMapping("/{id}")
	@ApiResponse(responseCode = "200", description = "The Application", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Application)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		return ApplicationResponse.of(applications.get(user.id(), id));
	}

	@PutMapping(value = "/{id}", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The saved Application, with its new version", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Application)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse save(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody SaveApplicationRequest request) {
		return ApplicationResponse.of(applications.save(user.id(), id, request.title(), request.company(),
				request.role(), request.location(), request.postingUrl(), request.postingText(), request.version()));
	}

	@PostMapping(value = "/{id}/stage", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The Application in its new Stage, with the timeline entry added",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Application)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse moveStage(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody MoveStageRequest request) {
		return ApplicationResponse.of(applications.moveStage(user.id(), id, request.stage(), request.version()));
	}

	private static String orEmpty(String text) {
		return text == null ? "" : text;
	}

}
