package com.coreex.applications;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

/**
 * An Application as stored. The version counts saves; a null folder is the top level. {@code titleAuto} is true until
 * the User renames it, and {@code appliedOn} is empty until the first move into Applied.
 */
public record Application(UUID id, String title, boolean titleAuto, String company, String role, String location,
		String postingUrl, String postingText, Stage stage, CloseReason closeReason, Instant appliedOn,
		LocalDate reminderOn, LocalTime reminderTime, List<TimelineEntry> timeline, int version, UUID folderId, Instant createdAt, Instant updatedAt) {

	/** The six fixed Stages, in the order a job normally moves through them. */
	public enum Stage {
		SAVED, APPLIED, SCREENING, INTERVIEW, OFFER, CLOSED
	}

	/** Why an Application is Closed. */
	public enum CloseReason {
		ACCEPTED, NOT_SELECTED, WITHDREW, ACCEPTED_ANOTHER, NO_RESPONSE
	}

	/** How an interview is held. */
	public enum InterviewKind {
		PHONE, VIDEO, ONSITE, OTHER
	}

	/** What a User can add to the timeline by hand; the Stage entries come from moving Stage. */
	public enum EntryType {
		NOTE, FOLLOWED_UP, REPLIED
	}

	/**
	 * One line of the timeline: STAGE (with its {@code stage}), NOTE (with its {@code text}), FOLLOWED_UP, REPLIED or
	 * INTERVIEW (with its {@code kind}, and its notes in {@code text}). {@code at} is the display date (12:00 UTC), except
	 * for an interview, where it is the exact start; {@code seq} is the order it was written, so same-day entries keep
	 * the order they happened in.
	 */
	public record TimelineEntry(String type, Stage stage, Instant at, int seq, String text, String kind) {
	}

	/**
	 * The start of the no-reply clock: the later of the applied date and the last follow-up or reply. Empty until the
	 * Application is applied.
	 */
	public Instant noReplySince() {
		return timeline.stream().filter(e -> e.type().equals("FOLLOWED_UP") || e.type().equals("REPLIED")).map(TimelineEntry::at)
				.reduce(appliedOn, (a, b) -> a == null || b.isAfter(a) ? b : a);
	}

}
