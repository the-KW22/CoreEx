package com.coreex.export;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

/** Everything the signed-in User keeps, as one zip. An Admin gets their own Items too, never another User's (ADR 0004). */
@RestController
@RequestMapping(value = "/api/export", produces = MediaType.APPLICATION_JSON_VALUE)
class ExportController {

	private static final String ZIP = "application/zip";

	private final ExportService exports;

	private final Clock clock;

	ExportController(ExportService exports, Clock clock) {
		this.exports = exports;
		this.clock = clock;
	}

	// JSON stays producible so a refusal (429) can still be written as the usual error body.
	@GetMapping(produces = { ZIP, MediaType.APPLICATION_JSON_VALUE })
	@ApiResponse(responseCode = "200", description = "A zip: Notes as Markdown and Assets as files in the Folder tree, and a manifest.json",
			content = @Content(mediaType = ZIP, schema = @Schema(type = "string", format = "binary")))
	@ApiResponse(responseCode = "429", description = "Code EXPORT_TOO_SOON: one export per minute", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	ResponseEntity<StreamingResponseBody> export(
			@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		exports.requireDue(user.id());
		var name = "coreex-export-" + LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC) + ".zip";
		StreamingResponseBody body = out -> exports.write(user.id(), out);
		return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
				.contentType(MediaType.parseMediaType(ZIP)).body(body);
	}

}
