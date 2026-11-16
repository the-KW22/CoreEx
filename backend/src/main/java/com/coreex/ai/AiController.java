package com.coreex.ai;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.media.Schema;

@RestController
@RequestMapping(value = "/api/ai", produces = MediaType.APPLICATION_JSON_VALUE)
class AiController {

	record Status(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "False until the owner sets the Shared key: AI features then show as pending") boolean available) {
	}

	private final AiService ai;

	AiController(AiService ai) {
		this.ai = ai;
	}

	@GetMapping("/status")
	Status status() {
		return new Status(ai.available());
	}

}
