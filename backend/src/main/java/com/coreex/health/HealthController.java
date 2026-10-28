package com.coreex.health;

import io.swagger.v3.oas.annotations.media.Schema;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class HealthController {

	record Health(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String status) {
	}

	@GetMapping(value = "/api/health", produces = MediaType.APPLICATION_JSON_VALUE)
	Health health() {
		return new Health("UP");
	}

}
