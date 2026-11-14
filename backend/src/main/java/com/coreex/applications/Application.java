package com.coreex.applications;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * An Application as stored. The version counts saves; a null folder is the top level. {@code titleAuto} is true until
 * the User renames it, and {@code appliedOn} is empty until the first move into Applied.
 */
public record Application(UUID id, String title, boolean titleAuto, String company, String role, String location,
		String postingUrl, String postingText, Stage stage, CloseReason closeReason, Instant appliedOn,
		List<TimelineEntry> timeline, int version, UUID folderId, Instant createdAt, Instant updatedAt) {

	/** The six fixed Stages, in the order a job normally moves through them. */
	public enum Stage {
		SAVED, APPLIED, SCREENING, INTERVIEW, OFFER, CLOSED
	}

	/** Why an Application is Closed. */
	public enum CloseReason {
		ACCEPTED, NOT_SELECTED, WITHDREW, ACCEPTED_ANOTHER, NO_RESPONSE
	}

	/** What a User can add to the timeline by hand; the Stage entries come from moving Stage. */
	public enum EntryType {
		NOTE, FOLLOWED_UP, REPLIED
	}

	/**
	 * One line of the timeline: STAGE (with its {@code stage}), NOTE (with its {@code text}), FOLLOWED_UP or REPLIED.
	 * {@code at} is the display date (12:00 UTC); {@code seq} is the order it was written, so same-day entries keep
	 * the order they happened in.
	 */
	public record TimelineEntry(String type, Stage stage, Instant at, int seq, String text) {
	}

	/**
	 * The start of the no-reply clock: the later of the applied date and the last follow-up or reply. Empty until the
	 * Application is applied.
	 */
	public Instant noReplySince() {
		return timeline.stream().filter(e -> !e.type().equals("STAGE") && !e.type().equals("NOTE")).map(TimelineEntry::at)
				.reduce(appliedOn, (a, b) -> a == null || b.isAfter(a) ? b : a);
	}

}
