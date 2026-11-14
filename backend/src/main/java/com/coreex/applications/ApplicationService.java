package com.coreex.applications;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.applications.Application.CloseReason;
import com.coreex.applications.Application.EntryType;
import com.coreex.applications.Application.Stage;
import com.coreex.applications.Application.TimelineEntry;
import com.coreex.common.ApiException;

@Service
public class ApplicationService {

	private final ApplicationRepository applications;

	private final Clock clock;

	ApplicationService(ApplicationRepository applications, Clock clock) {
		this.applications = applications;
		this.clock = clock;
	}

	private LocalDate today() {
		return LocalDate.now(clock.withZone(ZoneOffset.UTC));
	}

	/** A day's date on the timeline: the given day (never a future one) or today, at 12:00 UTC. */
	private Instant day(LocalDate date) {
		if (date != null && date.isAfter(today())) {
			throw invalid("A date cannot be in the future.");
		}
		return (date == null ? today() : date).atTime(12, 0).toInstant(ZoneOffset.UTC);
	}

	/** The timeline with one more entry, given the next write sequence. */
	private static List<TimelineEntry> append(List<TimelineEntry> timeline, String type, Stage stage, Instant at,
			String text) {
		var seq = timeline.stream().mapToInt(TimelineEntry::seq).max().orElse(0) + 1;
		var entries = new ArrayList<>(timeline);
		entries.add(new TimelineEntry(type, stage, at, seq, text));
		return entries;
	}

	/** The applied date is when the first Stage entry into Applied was written, so re-dating that entry moves it. */
	private static Instant appliedOn(List<TimelineEntry> timeline) {
		return timeline.stream().filter(e -> e.type().equals("STAGE") && e.stage() == Stage.APPLIED)
				.min(Comparator.comparingInt(TimelineEntry::seq)).map(TimelineEntry::at).orElse(null);
	}

	/** The one place a Stage, close reason and timeline are written together, so the applied date always follows. */
	private Application store(UUID ownerId, UUID id, int seenVersion, Stage stage, CloseReason closeReason,
			List<TimelineEntry> timeline) {
		if (!applications.saveTimeline(ownerId, id, seenVersion, stage, closeReason, appliedOn(timeline), timeline)) {
			throw conflict();
		}
		return get(ownerId, id);
	}

	/** The automatic title, which the Application keeps until the User renames it. */
	private static String titleOf(String role, String company) {
		return role + " at " + company;
	}

	@Transactional
	public Application create(UUID ownerId, String company, String role, String location, String postingUrl,
			String postingText) {
		var id = applications.insert(ownerId, titleOf(role, company), company, role, location, postingUrl, postingText,
				Stage.SAVED, null, append(List.of(), "STAGE", Stage.SAVED, day(null), null));
		return get(ownerId, id);
	}

	public Application get(UUID ownerId, UUID id) {
		return applications.find(ownerId, id).orElseThrow(ApplicationService::notFound);
	}

	public List<Application> list(UUID ownerId, int page, int size) {
		return applications.findPage(ownerId, size, (long) page * size);
	}

	public long total(UUID ownerId) {
		return applications.count(ownerId);
	}

	/**
	 * A User's save. The title sent back unchanged leaves the automatic title in place (it follows company and role); a
	 * different title is a rename, and the title is the User's from then on.
	 */
	@Transactional
	public Application save(UUID ownerId, UUID id, String title, String company, String role, String location,
			String postingUrl, String postingText, int seenVersion) {
		var current = get(ownerId, id);
		var auto = current.titleAuto() && title.equals(current.title());
		if (!applications.saveFields(ownerId, id, seenVersion, auto ? titleOf(role, company) : title, auto, company, role,
				location, postingUrl, postingText)) {
			throw conflict();
		}
		return get(ownerId, id);
	}

	/** Moves to a Stage, dated {@code date} or today. Closed needs a close reason; no other Stage takes one. */
	@Transactional
	public Application moveStage(UUID ownerId, UUID id, Stage stage, CloseReason closeReason, LocalDate date,
			int seenVersion) {
		if ((stage == Stage.CLOSED) != (closeReason != null)) {
			throw invalid(stage == Stage.CLOSED ? "Say why it closed." : "A close reason only goes with Closed.");
		}
		var current = get(ownerId, id);
		if (current.stage() == stage) {
			return current;
		}
		return store(ownerId, id, seenVersion, stage, closeReason,
				append(current.timeline(), "STAGE", stage, day(date), null));
	}

	/** Adds a note, "I followed up" or "They replied", dated {@code date} or today. */
	@Transactional
	public Application addEntry(UUID ownerId, UUID id, EntryType type, String text, LocalDate date, int seenVersion) {
		var current = get(ownerId, id);
		var note = type == EntryType.NOTE ? requireText(text) : null;
		return store(ownerId, id, seenVersion, current.stage(), current.closeReason(),
				append(current.timeline(), type.name(), null, day(date), note));
	}

	/** Re-dates an entry and, for a note, rewrites its text. A null date or text leaves that part as it was. */
	@Transactional
	public Application editEntry(UUID ownerId, UUID id, int seq, String text, LocalDate date, int seenVersion) {
		var current = get(ownerId, id);
		var old = entry(current, seq);
		if (text != null && !old.type().equals("NOTE")) {
			throw invalid("Only a note has text.");
		}
		var edited = new TimelineEntry(old.type(), old.stage(), date == null ? old.at() : day(date), seq,
				text == null ? old.text() : requireText(text));
		return store(ownerId, id, seenVersion, current.stage(), current.closeReason(),
				current.timeline().stream().map(e -> e.seq() == seq ? edited : e).toList());
	}

	/** Deletes an entry. A Stage entry stays: it is the record of a move. */
	@Transactional
	public Application deleteEntry(UUID ownerId, UUID id, int seq, int seenVersion) {
		var current = get(ownerId, id);
		if (entry(current, seq).type().equals("STAGE")) {
			throw invalid("A Stage entry cannot be deleted.");
		}
		return store(ownerId, id, seenVersion, current.stage(), current.closeReason(),
				current.timeline().stream().filter(e -> e.seq() != seq).toList());
	}

	private static TimelineEntry entry(Application application, int seq) {
		return application.timeline().stream().filter(e -> e.seq() == seq).findFirst()
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such timeline entry."));
	}

	private static String requireText(String text) {
		if (text == null || text.isBlank()) {
			throw invalid("A note cannot be empty.");
		}
		return text.strip();
	}

	private static ApiException invalid(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
	}

	private static ApiException conflict() {
		return new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
				"This Application was changed somewhere else since you opened it.");
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Application.");
	}

}
