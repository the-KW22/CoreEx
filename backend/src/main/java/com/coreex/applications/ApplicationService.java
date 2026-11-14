package com.coreex.applications;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

	/** What a move into a Stage leaves behind: the Stage, the applied date and the timeline with its new entry. */
	private record Transition(Stage stage, java.time.Instant appliedOn, List<TimelineEntry> timeline) {
	}

	/**
	 * The one transition rule every writer goes through: sets the Stage, appends a Stage entry (dated today at 12:00 UTC,
	 * with the next write sequence) and sets the applied date on the first move into Applied.
	 */
	private Transition transition(Stage to, java.time.Instant appliedOn, List<TimelineEntry> timeline) {
		var day = LocalDate.now(clock.withZone(ZoneOffset.UTC)).atTime(12, 0).toInstant(ZoneOffset.UTC);
		var seq = timeline.stream().mapToInt(TimelineEntry::seq).max().orElse(0) + 1;
		var entries = new ArrayList<>(timeline);
		entries.add(new TimelineEntry("STAGE", to, day, seq));
		return new Transition(to, appliedOn == null && to == Stage.APPLIED ? day : appliedOn, entries);
	}

	/** The automatic title, which the Application keeps until the User renames it. */
	private static String titleOf(String role, String company) {
		return role + " at " + company;
	}

	@Transactional
	public Application create(UUID ownerId, String company, String role, String location, String postingUrl,
			String postingText) {
		var start = transition(Stage.SAVED, null, List.of());
		var id = applications.insert(ownerId, titleOf(role, company), company, role, location, postingUrl, postingText,
				start.stage(), start.appliedOn(), start.timeline());
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

	@Transactional
	public Application moveStage(UUID ownerId, UUID id, Stage stage, int seenVersion) {
		var current = get(ownerId, id);
		if (current.stage() == stage) {
			return current;
		}
		var moved = transition(stage, current.appliedOn(), current.timeline());
		if (!applications.saveStage(ownerId, id, seenVersion, stage, moved.appliedOn(), moved.timeline())) {
			throw conflict();
		}
		return get(ownerId, id);
	}

	private static ApiException conflict() {
		return new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
				"This Application was changed somewhere else since you opened it.");
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Application.");
	}

}
