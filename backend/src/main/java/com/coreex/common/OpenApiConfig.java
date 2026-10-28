package com.coreex.common;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;

@Configuration
class OpenApiConfig {

	// A relative server keeps the committed spec identical on every machine and port.
	@Bean
	OpenAPI coreExOpenApi() {
		return new OpenAPI()
				.info(new Info().title("CoreEx API").version("0.1.0"))
				.addServersItem(new Server().url("/"));
	}

}
