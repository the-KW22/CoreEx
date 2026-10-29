package com.coreex.trash;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ApiException;

import io.swagger.v3.oas.annotations.Hidden;

/**
 * The trigger for a scheduler outside the backend (a GitHub Actions schedule), because the free host sleeps and the
 * in-process job only runs while it is awake. Not under {@code /api} (no User is involved) and not in the OpenAPI
 * spec. It is open to the public network, so it is protected by one shared token; with no token configured it does
 * not exist.
 */
@Hidden
@RestController
@RequestMapping(value = "/internal/trash", produces = MediaType.APPLICATION_JSON_VALUE)
class TrashPurgeController {

	record Purged(int removed) {
	}

	private final TrashPurgeJob job;

	private final TrashProperties properties;

	TrashPurgeController(TrashPurgeJob job, TrashProperties properties) {
		this.job = job;
		this.properties = properties;
	}

	@PostMapping("/purge")
	Purged purge(@RequestHeader(value = "X-Purge-Token", required = false) String token) {
		var expected = properties.purgeToken();
		if (expected.isBlank()) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is nothing here.");
		}
		// Constant time, so the response time does not reveal how much of a guess was right.
		if (token == null || !MessageDigest.isEqual(token.getBytes(StandardCharsets.UTF_8),
				expected.getBytes(StandardCharsets.UTF_8))) {
			throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "The purge token is missing or wrong.");
		}
		return new Purged(job.run());
	}

}
