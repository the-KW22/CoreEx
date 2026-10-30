package com.coreex.identity;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * {@code ownerEmail} signs in as the first Admin without an Invite (ADR 0004). {@code userCacheTtl} is how long a
 * resolved User is remembered before the database is asked again; zero turns the cache off.
 */
@ConfigurationProperties("coreex.identity")
record IdentityProperties(String ownerEmail, @DefaultValue("5m") Duration lastActiveThrottle,
		@DefaultValue("30s") Duration userCacheTtl) {
}
