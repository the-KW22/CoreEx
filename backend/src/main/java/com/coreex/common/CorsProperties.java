package com.coreex.common;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** The frontend origins allowed to call the API from a browser: only this environment's own site. */
@ConfigurationProperties("coreex.cors")
record CorsProperties(List<String> allowedOrigins) {
}
