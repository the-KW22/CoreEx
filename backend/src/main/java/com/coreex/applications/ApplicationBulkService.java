package com.coreex.applications;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

import org.springframework.stereotype.Service;

import com.coreex.applications.Application.CloseReason;
import com.coreex.applications.Application.Stage;
import com.coreex.common.ApiException;
import com.coreex.tags.TagService;

/**
 * An action on many Applications at once. Each one goes through the same code as the single action (so the transition
 * rule, the Tag rules and the scoping to the User are not repeated here) and in its own transaction, so one that fails
 * does not undo the others. An id that is missing, already in the Trash or another User's fails the same way: NOT_FOUND.
 */
@Service
public class ApplicationBulkService {

	/** One that did not work, and the error code that says why. */
	public record Failure(UUID id, String code) {
	}

	public record Result(List<UUID> done, List<Failure> failed) {
	}

	private final ApplicationService applications;

	private final TagService tags;

	ApplicationBulkService(ApplicationService applications, TagService tags) {
		this.applications = applications;
		this.tags = tags;
	}

	/** Moves each to the Stage, writing a timeline entry on each; Closed takes one reason for all. */
	public Result moveStage(UUID ownerId, List<UUID> ids, Stage stage, CloseReason closeReason, LocalDate date) {
		applications.checkMove(stage, closeReason, date);
		return each(ids, id -> applications.moveStage(ownerId, id, stage, closeReason, date, null,
				applications.get(ownerId, id).version()));
	}

	/** Puts the Tag with this name (created when the User has none) on each. */
	public Result addTag(UUID ownerId, List<UUID> ids, String name) {
		return each(ids, id -> {
			applications.get(ownerId, id);
			tags.attach(ownerId, id, name);
		});
	}

	/** Takes the Tag off each. A Tag that is not the User's fails the whole request with NOT_FOUND. */
	public Result removeTag(UUID ownerId, List<UUID> ids, UUID tagId) {
		tags.requireTag(ownerId, tagId);
		return each(ids, id -> {
			applications.get(ownerId, id);
			tags.detach(ownerId, id, tagId);
		});
	}

	public Result trash(UUID ownerId, List<UUID> ids) {
		return each(ids, id -> applications.trash(ownerId, id));
	}

	private static Result each(List<UUID> ids, Consumer<UUID> action) {
		var done = new ArrayList<UUID>();
		var failed = new ArrayList<Failure>();
		for (var id : new LinkedHashSet<>(ids)) {
			try {
				action.accept(id);
				done.add(id);
			}
			catch (ApiException e) {
				failed.add(new Failure(id, e.code()));
			}
		}
		return new Result(done, failed);
	}

}
