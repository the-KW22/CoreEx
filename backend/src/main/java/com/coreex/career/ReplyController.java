package com.coreex.career;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.career.CareerController.ResultResponse;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Reads an employer's email into an Application's Career workspace, and applies or undoes the changes it proposes. CoreEx never reads or sends mail. */
@RestController
@RequestMapping("/api/applications/{id}/career")
class ReplyController {

	record ReplyRequest(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The employer's email as pasted; its quoted history is removed")
			@NotBlank @Size(max = 20000) String message) {
	}

	private final CareerService career;

	private final ReplyService replies;

	private final CareerController results;

	ReplyController(CareerService career, ReplyService replies, CareerController results) {
		this.career = career;
		this.replies = replies;
		this.results = results;
	}

	/** Reads the employer's email; the reply and the changes it proposes are kept in the Library. */
	@PostMapping("/replies")
	@ResponseStatus(HttpStatus.CREATED)
	ResultResponse reply(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@Valid @RequestBody ReplyRequest request) {
		return results.respond(user.id(), List.of(career.reply(user.id(), id, request.message()))).get(0);
	}

	/** Applies one proposed change of a reply, through the Application's own rules. */
	@PostMapping("/results/{resultId}/changes/{index}/apply")
	ResultResponse apply(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID resultId, @PathVariable int index) {
		replies.apply(user.id(), id, resultId, index);
		return reloaded(user.id(), id, resultId);
	}

	/** Undoes an applied change, putting back the state it recorded before it was applied. */
	@PostMapping("/results/{resultId}/changes/{index}/undo")
	ResultResponse undo(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID resultId, @PathVariable int index) {
		replies.undo(user.id(), id, resultId, index);
		return reloaded(user.id(), id, resultId);
	}

	private ResultResponse reloaded(UUID owner, UUID applicationId, UUID resultId) {
		// shortcut: reads every result to return this one, the same as the email edit does; upgrade to a single-row read when the Library grows long.
		var stored = career.results(owner, applicationId).stream().filter(s -> s.id().equals(resultId)).findFirst().orElseThrow();
		return results.respond(owner, List.of(stored)).get(0);
	}

}
