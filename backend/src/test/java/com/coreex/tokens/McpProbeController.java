package com.coreex.tokens;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

/** Stands in for the real /mcp endpoint (a later ticket), so tests can tell a request got through authentication. Hidden so it stays out of openapi.json. */
@Hidden
@RestController
class McpProbeController {

	@GetMapping("/mcp")
	String probe() {
		return "ok";
	}

}
