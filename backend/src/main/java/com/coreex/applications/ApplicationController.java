package com.coreex.applications;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.DateTimeException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

import com.coreex.applications.Application.CloseReason;
import com.coreex.applications.Application.EntryType;
import com.coreex.applications.Application.InterviewKind;
import com.coreex.applications.Application.Stage;
import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.tags.TagColour;
import com.coreex.tags.TagService;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
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

	private static final int MAX_NOTE = 5000;

	private static final int MAX_BULK = 500;

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

	record MoveStageRequest(@NotNull Stage stage,
			@Schema(nullable = true, description = "Required for Closed, refused for every other Stage") CloseReason closeReason,
			@Schema(nullable = true, description = "The day it happened, never a future one. Empty means today") LocalDate date,
			@Schema(nullable = true, description = "The Stage the client saw. A move from any other Stage is a 409, but an edit that left the Stage alone does not refuse it") Stage fromStage,
			@Schema(nullable = true, description = "The version the client saw. Send this or fromStage") Integer version) {
	}

	record AddEntryRequest(@NotNull EntryType type,
			@Size(max = MAX_NOTE) @Pattern(regexp = NO_NUL) @Schema(nullable = true, description = "The note; required for NOTE, ignored otherwise") String text,
			@Schema(nullable = true, description = "The day it happened, never a future one. Empty means today") LocalDate date,
			@NotNull Integer version) {
	}

	record BulkIds(@NotEmpty @Size(max = MAX_BULK) List<@NotNull UUID> ids) {
	}

	record BulkStageRequest(@NotEmpty @Size(max = MAX_BULK) List<@NotNull UUID> ids, @NotNull Stage stage,
			@Schema(nullable = true, description = "Required for Closed, refused for every other Stage") CloseReason closeReason,
			@Schema(nullable = true, description = "The day it happened, never a future one. Empty means today") LocalDate date) {
	}

	record BulkAddTagRequest(@NotEmpty @Size(max = MAX_BULK) List<@NotNull UUID> ids,
			@NotBlank @Size(max = 50) @Pattern(regexp = NO_NUL) String name) {

		// Typed names often carry spaces; trim before validation, as the Item Tag call does.
		BulkAddTagRequest {
			name = name == null ? null : name.trim();
		}

	}

	record BulkRemoveTagRequest(@NotEmpty @Size(max = MAX_BULK) List<@NotNull UUID> ids, @NotNull UUID tagId) {
	}

	record BulkFailure(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "NOT_FOUND (missing, in the Trash, or not the User's), VERSION_CONFLICT or INVALID_REQUEST") String code) {
	}

	record BulkResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The ones that worked") List<UUID> done,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The ones that did not, with why. The others are unaffected") List<BulkFailure> failed) {

		static BulkResponse of(ApplicationBulkService.Result result) {
			return new BulkResponse(result.done(),
					result.failed().stream().map(f -> new BulkFailure(f.id(), f.code())).toList());
		}

	}

	record InterviewRequest(
			@NotNull @Schema(description = "The exact start. The page turns the User's local time into this, and back") Instant startsAt,
			@NotNull InterviewKind kind,
			@Size(max = MAX_NOTE) @Pattern(regexp = NO_NUL) @Schema(nullable = true) String notes,
			@NotNull Integer version) {
	}

	record ReminderRequest(
			@Schema(nullable = true, description = "The day to follow up. Empty clears the reminder") LocalDate on,
			@Schema(nullable = true, description = "The time that day, in the User's timezone. Empty means 09:00. Needs a date") LocalTime time,
			@NotNull Integer version) {
	}

	record EditEntryRequest(
			@Size(max = MAX_NOTE) @Pattern(regexp = NO_NUL) @Schema(nullable = true, description = "New note text; only for a NOTE. Empty keeps it") String text,
			@Schema(nullable = true, description = "A new day, never a future one. Empty keeps it") LocalDate date,
			@NotNull Integer version) {
	}

	record TimelineEntryResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "STAGE, NOTE, FOLLOWED_UP, REPLIED or INTERVIEW") String type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The Stage moved to; only for STAGE") Stage stage,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The display date, at 12:00 UTC") Instant at,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The order it was written in; names the entry in the edit and delete calls") int seq,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The note; only for NOTE. An interview's notes") String text,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "PHONE, VIDEO, ONSITE or OTHER; only for INTERVIEW, whose at is its exact start") String kind) {
	}

	record NextStepResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) NextStep.Kind kind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Ready to show, with any time already in the User's timezone") String label,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "When it became or becomes due; empty for Closed and Waiting") Instant dueAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "True when it needs the User now: what Needs you lists") boolean due) {

		static NextStepResponse of(NextStep n) {
			return new NextStepResponse(n.kind(), n.label(), n.dueAt(), n.due());
		}

	}

	record ApplicationResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String company,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String role,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String location,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String postingUrl,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String postingText,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Stage stage,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Why it closed; only when Closed") CloseReason closeReason,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "When the Application first moved into Applied, at 12:00 UTC") Instant appliedOn,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "Where the no-reply clock starts: the later of the applied date and the last follow-up or reply. Empty until applied") Instant noReplySince,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The follow-up reminder's day") LocalDate reminderOn,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The reminder's time; empty means 09:00 in the User's timezone") LocalTime reminderTime,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "What this Application needs from the User now, in the timezone sent as X-Timezone") NextStepResponse nextStep,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<TimelineEntryResponse> timeline,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant createdAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

		static ApplicationResponse of(Application a, NextStep next) {
			return new ApplicationResponse(a.id(), a.title(), a.company(), a.role(), a.location(), a.postingUrl(),
					a.postingText(), a.stage(), a.closeReason(), a.appliedOn(), a.noReplySince(),
					a.reminderOn(), a.reminderTime(), NextStepResponse.of(next),
					a.timeline().stream().map(e -> new TimelineEntryResponse(e.type(), e.stage(), e.at(), e.seq(), e.text(), e.kind())).toList(),
					a.version(), a.folderId(), a.createdAt(), a.updatedAt());
		}

	}

	record ApplicationTag(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
			@Schema(nullable = true) TagColour colour) {
	}

	record ApplicationPage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ApplicationResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Tags of each listed Application, by its id; one without Tags is left out") Map<UUID, List<ApplicationTag>> tags) {
	}

	private final ApplicationService applications;

	private final ApplicationBulkService bulk;

	private final HttpServletRequest request;

	private final TagService tags;

	ApplicationController(ApplicationService applications, ApplicationBulkService bulk, HttpServletRequest request,
			TagService tags) {
		this.applications = applications;
		this.bulk = bulk;
		this.request = request;
		this.tags = tags;
	}

	/** The User's timezone as the page sent it; UTC when it is missing or not a zone. */
	private ZoneId zone() {
		var sent = request.getHeader("X-Timezone");
		try {
			return sent == null ? ZoneId.of("UTC") : ZoneId.of(sent);
		}
		catch (DateTimeException e) {
			return ZoneId.of("UTC");
		}
	}

	private ApplicationResponse respond(Application a) {
		return ApplicationResponse.of(a, applications.nextStep(a, zone()));
	}

	@PostMapping(consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The new Application, in Saved", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody CreateApplicationRequest request) {
		return respond(applications.create(user.id(), request.company(), request.role(),
				orEmpty(request.location()), orEmpty(request.postingUrl()), orEmpty(request.postingText())));
	}

	/** The signed-in User's live Applications, grouped by Stage and sorted by Next step within each. */
	@GetMapping
	@ApiResponse(responseCode = "200", description = "A page of Applications, grouped by Stage and sorted by Next step within each", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ApplicationPage.class)))
	ApplicationPage list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size,
			@Parameter(description = "Only Applications whose Next step is due now") @RequestParam(defaultValue = "false") boolean needsYou) {
		var safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
		var listed = applications.list(user.id(), Math.max(0, page), safeSize, needsYou, zone());
		var tagged = tags.forItems(user.id(), listed.items().stream().map(Application::id).toList());
		var chips = new LinkedHashMap<UUID, List<ApplicationTag>>();
		tagged.forEach((id, list) -> chips.put(id, list.stream().map(t -> new ApplicationTag(t.id(), t.name(), t.colour())).toList()));
		return new ApplicationPage(listed.items().stream().map(this::respond).toList(), listed.total(), chips);
	}

	@GetMapping("/{id}")
	@ApiResponse(responseCode = "200", description = "The Application", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Application)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		return respond(applications.get(user.id(), id));
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
		return respond(applications.save(user.id(), id, request.title(), request.company(),
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
		return respond(applications.moveStage(user.id(), id, request.stage(), request.closeReason(),
				request.date(), request.fromStage(), request.version()));
	}

	/** Moves the Application to the Trash, where Restore brings it back with its timeline unchanged. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Moved to the Trash")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Application)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void trash(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		applications.trash(user.id(), id);
	}

	@PostMapping(value = "/{id}/timeline", consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The Application with the new timeline entry", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse addEntry(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody AddEntryRequest request) {
		return respond(applications.addEntry(user.id(), id, request.type(), request.text(),
				request.date(), request.version()));
	}

	@PutMapping(value = "/{id}/timeline/{seq}", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The Application with the entry changed", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse editEntry(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable int seq, @Valid @RequestBody EditEntryRequest request) {
		return respond(applications.editEntry(user.id(), id, seq, request.text(), request.date(),
				request.version()));
	}

	@DeleteMapping("/{id}/timeline/{seq}")
	@ApiResponse(responseCode = "200", description = "The Application without the entry", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST (a Stage entry cannot be deleted)", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse deleteEntry(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable int seq, @RequestParam int version) {
		return respond(applications.deleteEntry(user.id(), id, seq, version));
	}

	@PostMapping(value = "/{id}/interviews", consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The Application with the new interview on its timeline", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse addInterview(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody InterviewRequest request) {
		return respond(applications.addInterview(user.id(), id, request.startsAt(), request.kind(),
				request.notes(), request.version()));
	}

	@PutMapping(value = "/{id}/interviews/{seq}", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The Application with the interview changed. Remove an interview with the timeline entry delete", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse editInterview(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @PathVariable int seq, @Valid @RequestBody InterviewRequest request) {
		return respond(applications.editInterview(user.id(), id, seq, request.startsAt(), request.kind(),
				request.notes(), request.version()));
	}

	@PutMapping(value = "/{id}/reminder", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The Application with its reminder set, changed or cleared", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ApplicationResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code VERSION_CONFLICT", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	ApplicationResponse setReminder(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody ReminderRequest request) {
		return respond(applications.setReminder(user.id(), id, request.on(), request.time(),
				request.version()));
	}

	@PostMapping(value = "/bulk/stage", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "Each Application moved through the transition rule, with a timeline entry; the failures are listed", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = BulkResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	BulkResponse bulkStage(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody BulkStageRequest request) {
		return BulkResponse.of(bulk.moveStage(user.id(), request.ids(), request.stage(), request.closeReason(), request.date()));
	}

	@PostMapping(value = "/bulk/tags/add", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The Tag put on each Application; the failures are listed", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = BulkResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	BulkResponse bulkAddTag(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody BulkAddTagRequest request) {
		return BulkResponse.of(bulk.addTag(user.id(), request.ids(), request.name()));
	}

	@PostMapping(value = "/bulk/tags/remove", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The Tag taken off each Application; the failures are listed. An unknown Tag is a 404", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = BulkResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	BulkResponse bulkRemoveTag(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody BulkRemoveTagRequest request) {
		return BulkResponse.of(bulk.removeTag(user.id(), request.ids(), request.tagId()));
	}

	@PostMapping(value = "/bulk/trash", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "Each Application moved to the Trash (bring it back with the Trash restore call); the failures are listed", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = BulkResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	BulkResponse bulkTrash(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody BulkIds request) {
		return BulkResponse.of(bulk.trash(user.id(), request.ids()));
	}

	private static String orEmpty(String text) {
		return text == null ? "" : text;
	}

}
