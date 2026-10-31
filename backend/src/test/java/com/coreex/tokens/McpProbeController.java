package com.coreex.tokens;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Stands in for the real /mcp endpoint (a later ticket), so tests can tell a request got through authentication. */
@RestController
class McpProbeController {

	@GetMapping("/mcp")
	String probe() {
		return "ok";
	}

}
