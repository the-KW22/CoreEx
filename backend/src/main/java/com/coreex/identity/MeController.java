package com.coreex.identity;

import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

@RestController
class MeController {

	record Me(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String email,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) User.Role role) {
	}

	@GetMapping(value = "/api/me", produces = MediaType.APPLICATION_JSON_VALUE)
	@ApiResponse(responseCode = "200", description = "The signed-in User", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = Me.class)))
	@ApiResponse(responseCode = "403", description = "Code NOT_INVITED or USER_DISABLED", content = @Content(
			mediaType = MediaType.APPLICATION_JSON_VALUE, schema = @Schema(implementation = ErrorBody.class)))
	Me me(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return new Me(user.id(), user.email(), user.role());
	}

}
