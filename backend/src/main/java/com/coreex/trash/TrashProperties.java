package com.coreex.trash;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** How long things wait in the Trash before the purge job removes them for good. */
@ConfigurationProperties("coreex.trash")
record TrashProperties(@DefaultValue("30d") Duration retention) {
}
