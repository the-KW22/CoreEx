package com.coreex.access;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The public page's "Request access": no sign-in, one write, no read. It answers 202 with no body for every valid
 * email, new or not, and reads and returns no other data.
 */
@RestController
@RequestMapping(value = "/api/access-requests", produces = MediaType.APPLICATION_JSON_VALUE)
class AccessRequestController {

	record RequestAccessBody(@NotBlank(message = "Enter your email address.") @Email(message = "Enter a valid email address.") @Size(max = 254, message = "Enter a valid email address.") String email) {

		// Pasted emails often carry spaces; trim before validation.
		RequestAccessBody {
			email = email == null ? null : email.trim();
		}

	}

	private final AccessRequestService service;

	AccessRequestController(AccessRequestService service) {
		this.service = service;
	}

	// shortcut: the web app asks from its server, so the API sees the web host's address; the app forwards the visitor's
	// in this header. Any direct caller can set it to anything, so the per-address limit only slows honest repeats and
	// the daily cap is the real guard. Upgrade to a header the app signs, or call from the browser, if abuse shows up.
	@PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.ACCEPTED)
	@ApiResponse(responseCode = "202", description = "Received (the same answer whether or not the email was new)")
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "429", description = "Code RATE_LIMITED", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	void request(@Valid @RequestBody RequestAccessBody body,
			@Parameter(description = "The visitor's address, forwarded by the web app") @RequestHeader(name = "X-Visitor-IP", required = false) String visitor,
			@Parameter(hidden = true) HttpServletRequest http) {
		var address = visitor == null || visitor.isBlank() || visitor.length() > 64 ? http.getRemoteAddr() : visitor.trim();
		service.request(body.email(), address);
	}

}
