package com.coreex.export;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** How soon a User may export again: configuration, not code. */
@ConfigurationProperties("coreex.export")
record ExportProperties(@DefaultValue("1m") Duration minInterval) {
}
