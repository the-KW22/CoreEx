package com.coreex.tokens;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code defaultExpiry} applies when a token is created without an expiry, {@code maxActive} caps a User's live
 * tokens, {@code callsPerMinute} is the rate limit per token, and {@code lastUsedThrottle} is how often a busy token
 * rewrites its last-used time.
 */
@ConfigurationProperties("coreex.tokens")
record AccessTokenProperties(@DefaultValue("90d") Duration defaultExpiry, @DefaultValue("10") int maxActive,
		@DefaultValue("60") int callsPerMinute, @DefaultValue("1m") Duration lastUsedThrottle) {
}
