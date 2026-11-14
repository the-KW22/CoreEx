package com.coreex.applications;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * An Application as stored. The version counts saves; a null folder is the top level. {@code titleAuto} is true until
 * the User renames it, and {@code appliedOn} is empty until the first move into Applied.
 */
public record Application(UUID id, String title, boolean titleAuto, String company, String role, String location,
		String postingUrl, String postingText, Stage stage, Instant appliedOn, List<TimelineEntry> timeline,
		int version, UUID folderId, Instant createdAt, Instant updatedAt) {

	/** The six fixed Stages, in the order a job normally moves through them. */
	public enum Stage {
		SAVED, APPLIED, SCREENING, INTERVIEW, OFFER, CLOSED
	}

	/** One line of the timeline. {@code at} is the display date (12:00 UTC); {@code seq} is the order it was written. */
	public record TimelineEntry(String type, Stage stage, Instant at, int seq) {
	}

}
