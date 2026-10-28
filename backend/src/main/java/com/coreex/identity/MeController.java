package com.coreex.identity;

import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;

@RestController
class MeController {

	record Me(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String email,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) User.Role role) {
	}

	@GetMapping(value = "/api/me", produces = MediaType.APPLICATION_JSON_VALUE)
	Me me(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return new Me(user.id(), user.email(), user.role());
	}

}
