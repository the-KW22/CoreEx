package com.coreex.resumes;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * How Resume versions are kept, as for Notes: for how long, how many per Resume, and how far apart the versions of a
 * User's own quick saves are (autosave would otherwise keep one per second). Named versions are not counted and never
 * expire.
 */
@ConfigurationProperties("coreex.resumes.versions")
record ResumeVersionProperties(@DefaultValue("90d") Duration retention, @DefaultValue("50") int keep,
		@DefaultValue("2m") Duration gap) {
}
