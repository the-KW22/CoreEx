package com.coreex.access;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** {@code perIpPerHour} limits one address, {@code perDay} caps all requests together over the last 24 hours. */
@ConfigurationProperties("coreex.access-requests")
record AccessRequestProperties(@DefaultValue("5") int perIpPerHour, @DefaultValue("200") int perDay) {
}
