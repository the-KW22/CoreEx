package com.coreex.career;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.career.CareerController.ResultResponse;
import com.coreex.common.ApiException;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** The Application emails of an Application's Career workspace: drafted by AI, then edited by the User. CoreEx never sends them. */
@RestController
@RequestMapping("/api/applications/{id}/career")
class EmailController {

	enum Kind { APPLICATION, FOLLOW_UP, THANK_YOU }

	record EmailRequest(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "APPLICATION (the email that sends the Resume and Cover Letter), FOLLOW_UP or THANK_YOU")
			@NotNull Kind kind,
			@Schema(nullable = true, description = "The interview's seq; required for THANK_YOU") Integer interviewSeq) {
	}

	record EditEmailRequest(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotBlank @Size(max = 200) String subject,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) @NotBlank @Size(max = 5000) String body) {
	}

	private final CareerService career;

	private final CareerController results;

	EmailController(CareerService career, CareerController results) {
		this.career = career;
		this.results = results;
	}

	/** Drafts an Application email; it is kept in the Library as an editable result. */
	@PostMapping("/emails")
	@ResponseStatus(HttpStatus.CREATED)
	ResultResponse draft(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@Valid @RequestBody EmailRequest request) {
		var stored = switch (request.kind()) {
			case APPLICATION -> career.applicationEmail(user.id(), id);
			case FOLLOW_UP -> career.followUp(user.id(), id);
			case THANK_YOU -> {
				if (request.interviewSeq() == null) {
					throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Say which interview the thank-you is for.");
				}
				yield career.thankYou(user.id(), id, request.interviewSeq());
			}
		};
		return results.respond(user.id(), List.of(stored)).get(0);
	}

	/** Saves the User's edit of an email result: the subject and body. */
	@PutMapping("/results/{resultId}/email")
	ResultResponse edit(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@PathVariable UUID resultId, @Valid @RequestBody EditEmailRequest request) {
		return results.respond(user.id(), List.of(career.editEmail(user.id(), id, resultId, request.subject(), request.body()))).get(0);
	}

}
