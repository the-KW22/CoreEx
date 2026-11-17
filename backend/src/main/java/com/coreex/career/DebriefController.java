package com.coreex.career;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.career.DebriefService.Asked;
import com.coreex.career.DebriefService.Debrief;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** The Debriefs of an Application's interviews. */
@RestController
@RequestMapping("/api/applications/{id}/career")
class DebriefController {

	record AskedBody(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotNull @Size(max = 1000) String question,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "WELL, MIXED or POORLY") @NotNull String landed,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotNull @Size(max = 2000) String note) {
	}

	record SaveDebriefRequest(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotNull @Size(max = 10000) String notes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "At most 30") @NotNull @Size(max = 30) List<@Valid AskedBody> questions,
			@Schema(requiredMode = Schema.RequiredMode.NOT_REQUIRED, nullable = true, description = "The version you saw; leave out to create the Debrief") Integer version) {
	}

	record DebriefResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The interview's seq in the timeline") int interviewSeq,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant interviewAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "PHONE, VIDEO, ONSITE or OTHER") String interviewKind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String notes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<AskedBody> questions,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {
	}

	record DebriefList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Latest interview first") List<DebriefResponse> items) {
	}

	private final DebriefService debriefs;

	DebriefController(DebriefService debriefs) {
		this.debriefs = debriefs;
	}

	private static DebriefResponse respond(Debrief d) {
		return new DebriefResponse(d.interviewSeq(), d.interviewAt(), d.interviewKind(), d.notes(),
				d.questions().stream().map(q -> new AskedBody(q.question(), q.landed(), q.note())).toList(), d.version(), d.updatedAt());
	}

	@GetMapping("/debriefs")
	DebriefList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id) {
		return new DebriefList(debriefs.list(user.id(), id).stream().map(DebriefController::respond).toList());
	}

	/** Creates or replaces the Debrief of one interview; the interview must be an entry of this Application. */
	@PutMapping("/interviews/{seq}/debrief")
	DebriefResponse save(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable int seq, @Valid @RequestBody SaveDebriefRequest request) {
		return respond(debriefs.save(user.id(), id, seq, request.notes(),
				request.questions().stream().map(q -> new Asked(q.question(), q.landed(), q.note())).toList(), request.version()));
	}

}
