package com.coreex.notes;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * How Note versions are kept: for how long, how many per Note, and how far apart the versions of a User's own
 * quick saves are (autosave would otherwise keep one per second).
 */
@ConfigurationProperties("coreex.notes.versions")
record NoteVersionProperties(@DefaultValue("90d") Duration retention, @DefaultValue("50") int keep,
		@DefaultValue("2m") Duration gap) {
}
