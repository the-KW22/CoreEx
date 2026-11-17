package com.coreex.applications;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.applications.Application.CloseReason;
import com.coreex.applications.Application.EntryType;
import com.coreex.applications.Application.InterviewKind;
import com.coreex.applications.Application.Stage;
import com.coreex.applications.Application.TimelineEntry;
import com.coreex.common.ApiException;

@Service
public class ApplicationService {

	private final ApplicationRepository applications;

	private final Clock clock;
	private final ApplicationLinkedDocuments linkedDocuments;

	ApplicationService(ApplicationRepository applications, Clock clock, ApplicationLinkedDocuments linkedDocuments) {
		this.applications = applications;
		this.clock = clock;
		this.linkedDocuments = linkedDocuments;
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
			String text, String kind) {
		var seq = timeline.stream().mapToInt(TimelineEntry::seq).max().orElse(0) + 1;
		var entries = new ArrayList<>(timeline);
		entries.add(new TimelineEntry(type, stage, at, seq, text, kind));
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
		return store(ownerId, id, seenVersion, stage, closeReason, timeline, false);
	}

	private Application store(UUID ownerId, UUID id, int seenVersion, Stage stage, CloseReason closeReason,
			List<TimelineEntry> timeline, boolean clearReminder) {
		if (!applications.saveTimeline(ownerId, id, seenVersion, stage, closeReason, appliedOn(timeline), timeline,
				clearReminder)) {
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
		return create(ownerId, company, role, location, postingUrl, postingText, null).application();
	}

	/** An Application named by id and title, for a pointer to it. */
	public record Found(UUID id, String title) {
	}

	/** Refuses a posting link another live Application of the User's already holds; a link that is not one never clashes. */
	private void requireNewPosting(UUID ownerId, String postingUrl, UUID except) {
		var canonical = CanonicalUrl.of(postingUrl);
		if (!canonical.isEmpty()) {
			applications.duplicateOf(ownerId, canonical, except).ifPresent(found -> {
				throw new DuplicatePostingException(found.id(), found.title());
			});
		}
	}

	/** The User's earlier Applications at this company that were closed with no response (never the one in {@code except}). */
	public List<Found> neverAnswered(UUID ownerId, String company, UUID except) {
		return company == null || company.isBlank() ? List.of() : applications.neverAnswered(ownerId, company, except);
	}

	/** An Application and whether this call made it. */
	public record Created(Application application, boolean isNew) {
	}

	/**
	 * With an {@code id} the caller made up, a repeated request returns the Application instead of making a second
	 * one: a live Application of this User with that id comes back exactly as stored, and nothing in the request is
	 * applied. Any other use of the id is refused with one answer, so it does not say whose it is.
	 */
	@Transactional
	public Created create(UUID ownerId, String company, String role, String location, String postingUrl,
			String postingText, UUID id) {
		if (id != null) {
			var existing = applications.find(ownerId, id);
			if (existing.isPresent()) {
				return new Created(existing.get(), false);
			}
		}
		requireNewPosting(ownerId, postingUrl, null);
		var made = applications.insert(ownerId, id, titleOf(role, company), company, role, location, postingUrl,
				postingText, Stage.SAVED, null, append(List.of(), "STAGE", Stage.SAVED, day(null), null, null));
		if (made.isEmpty()) {
			// Taken since the look-up above, by a request racing this one (ours to return) or by someone else's Item.
			var raced = applications.find(ownerId, id)
					.orElseThrow(() -> invalid("That id cannot be used for a new Application."));
			return new Created(raced, false);
		}
		return new Created(get(ownerId, made.get()), true);
	}

	public Application get(UUID ownerId, UUID id) {
		return applications.find(ownerId, id).orElseThrow(ApplicationService::notFound);
	}

	/** One page of the list, and how many Applications there are in all. */
	public record Listed(List<Application> items, int total) {
	}

	public NextStep nextStep(Application application, ZoneId zone) {
		return NextStep.of(application, clock.instant(), zone);
	}

	/**
	 * The User's Applications grouped by Stage (in Stage order) and, within a Stage, by Next step; {@code needsYou}
	 * keeps only those whose Next step is due now. The Next step is worked out for every Application, so the order
	 * holds across pages.
	 * shortcut: loads all of a User's Applications for each page, fine for hundreds; upgrade to a stored Next step
	 * when anyone has thousands.
	 */
	public Listed list(UUID ownerId, int page, int size, boolean needsYou, ZoneId zone) {
		return list(ownerId, page, size, needsYou, zone, null);
	}

	/** The same, narrowed to one Stage when {@code stage} is given. */
	public Listed list(UUID ownerId, int page, int size, boolean needsYou, ZoneId zone, Stage stage) {
		var now = clock.instant();
		var sorted = applications.findAll(ownerId).stream().filter(a -> stage == null || a.stage() == stage)
				.map(a -> Map.entry(a, NextStep.of(a, now, zone)))
				.filter(e -> !needsYou || e.getValue().due())
				.sorted(Comparator.<Map.Entry<Application, NextStep>>comparingInt(e -> e.getKey().stage().ordinal())
						.thenComparingLong(e -> e.getValue().sortKey()))
				.map(Map.Entry::getKey).toList();
		var from = Math.min(sorted.size(), page * size);
		return new Listed(sorted.subList(from, Math.min(sorted.size(), from + size)), sorted.size());
	}

	/**
	 * A User's save. The title sent back unchanged leaves the automatic title in place (it follows company and role); a
	 * different title is a rename, and the title is the User's from then on.
	 */
	@Transactional
	public Application save(UUID ownerId, UUID id, String title, String company, String role, String location,
			String postingUrl, String postingText, int seenVersion) {
		var current = get(ownerId, id);
		if (!CanonicalUrl.of(postingUrl).equals(CanonicalUrl.of(current.postingUrl()))) {
			requireNewPosting(ownerId, postingUrl, id);
		}
		var auto = current.titleAuto() && title.equals(current.title());
		if (!applications.saveFields(ownerId, id, seenVersion, auto ? titleOf(role, company) : title, auto, company, role,
				location, postingUrl, postingText)) {
			throw conflict();
		}
		return get(ownerId, id);
	}

	/**
	 * Moves to a Stage, dated {@code date} or today. Closed needs a close reason; no other Stage takes one. The caller
	 * names the version it saw, or the Stage it saw ({@code from}): a move from a Stage the Application has left is a
	 * conflict, while an edit that left the Stage alone is not.
	 */
	@Transactional
	public Application moveStage(UUID ownerId, UUID id, Stage stage, CloseReason closeReason, LocalDate date,
			Stage from, Integer seenVersion) {
		checkMove(stage, closeReason, date);
		if (from == null && seenVersion == null) {
			throw invalid("Send the version or the Stage you saw.");
		}
		var current = get(ownerId, id);
		if (from != null && current.stage() != from) {
			throw conflict();
		}
		if (current.stage() == stage) {
			return current;
		}
		var moved = store(ownerId, id, from != null ? current.version() : seenVersion, stage, closeReason,
				append(current.timeline(), "STAGE", stage, day(date), stage == Stage.CLOSED ? closeReason.name() : null, null));
		if (stage == Stage.APPLIED && current.appliedOn() == null) linkedDocuments.snapshot(ownerId, id);
		return moved;
	}

	/** The rules of a move that do not depend on the Application, so a bulk move can refuse them once. */
	void checkMove(Stage stage, CloseReason closeReason, LocalDate date) {
		if ((stage == Stage.CLOSED) != (closeReason != null)) {
			throw invalid(stage == Stage.CLOSED ? "Say why it closed." : "A close reason only goes with Closed.");
		}
		day(date);
	}

	/**
	 * Moves the Application to the Trash, where Restore brings it back with its timeline unchanged. The Trash, Restore
	 * and delete forever work on the Item row this sets, as for every Item.
	 */
	@Transactional
	public void trash(UUID ownerId, UUID id) {
		if (!applications.softDelete(ownerId, id, clock.instant())) {
			throw notFound();
		}
	}

	/** The PDFs sent for the Application, oldest first. Only the Assets that are not in the Trash. */
	public List<ApplicationDocument> documents(UUID ownerId, UUID id) {
		get(ownerId, id);
		return applications.documents(ownerId, id);
	}

	/** Attaches one of the User's own PDFs with a label; attaching it again changes the label. */
	@Transactional
	public void attach(UUID ownerId, UUID id, UUID assetId, ApplicationDocument.Label label) {
		get(ownerId, id);
		var mime = applications.assetMimeType(ownerId, assetId)
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Asset."));
		if (!"application/pdf".equals(mime)) {
			throw invalid("Only a PDF can be attached.");
		}
		applications.attach(id, assetId, label);
	}

	/** Takes the PDF off the Application; the Asset stays. */
	@Transactional
	public void detach(UUID ownerId, UUID id, UUID assetId) {
		get(ownerId, id);
		if (!applications.detach(id, assetId)) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "That PDF is not attached.");
		}
	}

	/** Adds a note, "I followed up" or "They replied", dated {@code date} or today. */
	@Transactional
	public Application addEntry(UUID ownerId, UUID id, EntryType type, String text, LocalDate date, int seenVersion) {
		var current = get(ownerId, id);
		var note = type == EntryType.NOTE ? requireText(text) : null;
		// "I followed up" is the reminder done, so it clears the reminder.
		return store(ownerId, id, seenVersion, current.stage(), current.closeReason(),
				append(current.timeline(), type.name(), null, day(date), note, null), type == EntryType.FOLLOWED_UP);
	}

	/** Re-dates an entry and, for a note, rewrites its text. A null date or text leaves that part as it was. */
	@Transactional
	public Application editEntry(UUID ownerId, UUID id, int seq, String text, LocalDate date, int seenVersion) {
		var current = get(ownerId, id);
		var old = entry(current, seq);
		if (old.type().equals("INTERVIEW")) {
			throw invalid("Change an interview through its own call.");
		}
		if (text != null && !old.type().equals("NOTE")) {
			throw invalid("Only a note has text.");
		}
		var edited = new TimelineEntry(old.type(), old.stage(), date == null ? old.at() : day(date), seq,
				text == null ? old.text() : requireText(text), null);
		return store(ownerId, id, seenVersion, current.stage(), current.closeReason(),
				current.timeline().stream().map(e -> e.seq() == seq ? edited : e).toList());
	}

	/** Adds an interview: the exact start (any time, past or future), how it is held, and notes. */
	@Transactional
	public Application addInterview(UUID ownerId, UUID id, Instant startsAt, InterviewKind kind, String notes,
			int seenVersion) {
		var current = get(ownerId, id);
		return store(ownerId, id, seenVersion, current.stage(), current.closeReason(),
				append(current.timeline(), "INTERVIEW", null, startsAt, notes == null ? "" : notes.strip(), kind.name()));
	}

	/** Replaces an interview's start, kind and notes. */
	@Transactional
	public Application editInterview(UUID ownerId, UUID id, int seq, Instant startsAt, InterviewKind kind, String notes,
			int seenVersion) {
		var current = get(ownerId, id);
		if (!entry(current, seq).type().equals("INTERVIEW")) {
			throw invalid("That entry is not an interview.");
		}
		var edited = new TimelineEntry("INTERVIEW", null, startsAt, seq, notes == null ? "" : notes.strip(), kind.name());
		return store(ownerId, id, seenVersion, current.stage(), current.closeReason(),
				current.timeline().stream().map(e -> e.seq() == seq ? edited : e).toList());
	}

	/** Sets, changes or (with no date) clears the one follow-up reminder. A time needs a date. */
	@Transactional
	public Application setReminder(UUID ownerId, UUID id, LocalDate on, LocalTime time, int seenVersion) {
		if (on == null && time != null) {
			throw invalid("A reminder time needs a date.");
		}
		get(ownerId, id);
		if (!applications.saveReminder(ownerId, id, seenVersion, on, time)) {
			throw conflict();
		}
		return get(ownerId, id);
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
