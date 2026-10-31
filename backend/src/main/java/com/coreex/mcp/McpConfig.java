package com.coreex.mcp;

import java.util.Map;

import org.springframework.ai.mcp.server.common.autoconfigure.properties.McpServerStreamableHttpProperties;
import org.springframework.ai.mcp.server.webmvc.transport.WebMvcStatelessServerTransport;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.coreex.identity.CurrentUserInterceptor;

import io.modelcontextprotocol.common.McpTransportContext;
import io.modelcontextprotocol.json.jackson3.JacksonMcpJsonMapper;
import tools.jackson.databind.json.JsonMapper;

@Configuration
class McpConfig {

	static final String USER = "user";

	/**
	 * The starter's own transport, plus one thing: it copies the User that the Access token filter put on the request
	 * into the MCP context. Tools run on another thread, where the security context is not available, so this is how
	 * they learn who is calling.
	 */
	@Bean
	WebMvcStatelessServerTransport webMvcStatelessServerTransport(@Qualifier("mcpServerJsonMapper") JsonMapper json,
			McpServerStreamableHttpProperties properties) {
		return WebMvcStatelessServerTransport.builder().jsonMapper(new JacksonMcpJsonMapper(json))
				.messageEndpoint(properties.getMcpEndpoint())
				.contextExtractor(request -> McpTransportContext
						.create(Map.of(USER, request.servletRequest().getAttribute(CurrentUserInterceptor.ATTRIBUTE))))
				.build();
	}

}
