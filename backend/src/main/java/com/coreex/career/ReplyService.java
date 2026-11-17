package com.coreex.career;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.applications.Application.CloseReason;
import com.coreex.applications.Application.Stage;
import com.coreex.applications.ApplicationService;
import com.coreex.applications.ApplicationService.Snapshot;
import com.coreex.career.CareerService.Change;
import com.coreex.common.ApiException;

import tools.jackson.databind.json.JsonMapper;

/**
 * Applies and undoes the changes an employer's reply proposes: a Stage, a follow-up reminder or Offer terms. Each change goes
 * through the Application's own rules, and its exact before and after are kept, so Undo can put the old state back.
 */
@Service
public class ReplyService {

	/** The follow-up reminder of an Application, before a change or after it. */
	public record Reminder(LocalDate on, LocalTime time) {
	}

	/** Where a change of a reply stands (PROPOSED, APPLIED or UNDONE) and whether Undo is allowed now. */
	public record State(String state, boolean canUndo) {
	}

	private record Applied(String kind, String before, int resultingVersion, UUID offerId) {
	}

	private final JdbcClient jdbc;

	private final CareerService career;

	private final ApplicationService applications;

	private final OfferService offers;

	private final JsonMapper json = JsonMapper.builder().build();

	ReplyService(JdbcClient jdbc, CareerService career, ApplicationService applications, OfferService offers) {
		this.jdbc = jdbc;
		this.career = career;
		this.applications = applications;
		this.offers = offers;
	}

	private static ApiException conflict(String message) {
		return new ApiException(HttpStatus.CONFLICT, "CONFLICT", message);
	}

	private static LocalDate date(String text) {
		return text == null ? null : LocalDate.parse(text);
	}

	private Change change(UUID owner, UUID applicationId, UUID resultId, int index) {
		var changes = career.replyOf(owner, applicationId, resultId).changes();
		if (index < 0 || index >= changes.size()) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such change.");
		}
		return changes.get(index);
	}

	/**
	 * Applies one change the reply proposes, through the Application's own rules, and records its exact before and after. A
	 * change that is already applied is a 409; so is one the Application no longer allows, and nothing is written then.
	 */
	@Transactional
	public void apply(UUID owner, UUID applicationId, UUID resultId, int index) {
		var change = change(owner, applicationId, resultId, index);
		var applied = jdbc.sql("""
				select undone_at is null from career_changes where result_id = :result and idx = :idx and owner_id = :owner""")
				.param("result", resultId).param("idx", index).param("owner", owner).query(Boolean.class).optional().orElse(false);
		if (applied) {
			throw conflict("That change is already applied.");
		}
		var app = applications.get(owner, applicationId);
		Object before;
		Object after;
		UUID offerId = null;
		int version;
		switch (change.type()) {
			case "STAGE" -> {
				var stage = Stage.valueOf(change.stage());
				if (app.stage() == stage) {
					throw conflict("The Application is already at that Stage.");
				}
				var closeReason = change.closeReason() == null ? null : CloseReason.valueOf(change.closeReason());
				var moved = applications.moveStage(owner, applicationId, stage, closeReason, date(change.date()), app.stage(), null);
				before = ApplicationService.snapshotOf(app);
				after = ApplicationService.snapshotOf(moved);
				version = moved.version();
			}
			case "FOLLOW_UP" -> {
				before = new Reminder(app.reminderOn(), app.reminderTime());
				var time = change.time() == null ? null : LocalTime.parse(change.time());
				var moved = applications.setReminder(owner, applicationId, date(change.date()), time, app.version());
				after = new Reminder(moved.reminderOn(), moved.reminderTime());
				version = moved.version();
			}
			case "OFFER" -> {
				var proposed = OfferTerms.fromMap(change.offer());
				var latest = offers.list(owner, applicationId).stream().findFirst();
				if (latest.isEmpty()) {
					var made = offers.create(owner, applicationId, proposed);
					before = null;
					offerId = made.id();
					after = made.terms();
					version = made.version();
				}
				else {
					var seen = latest.get();
					var saved = offers.update(owner, seen.id(), seen.terms().overlaid(proposed), seen.version());
					before = seen.terms();
					offerId = seen.id();
					after = saved.terms();
					version = saved.version();
				}
			}
			default -> throw new IllegalStateException("Unknown change type " + change.type());
		}
		var kept = jdbc.sql("""
				insert into career_changes (result_id, idx, owner_id, item_id, kind, before, after, resulting_version, offer_id)
				values (:result, :idx, :owner, :app, :kind, cast(:before as jsonb), cast(:after as jsonb), :version, :offer)
				on conflict (result_id, idx) do update set before = excluded.before, after = excluded.after,
				  resulting_version = excluded.resulting_version, offer_id = excluded.offer_id, applied_at = now(), undone_at = null
				where career_changes.undone_at is not null""")
				.param("result", resultId).param("idx", index).param("owner", owner).param("app", applicationId)
				.param("kind", change.type()).param("before", json.writeValueAsString(before))
				.param("after", json.writeValueAsString(after)).param("version", version).param("offer", offerId).update();
		if (kept == 0) {
			throw conflict("That change was applied at the same time. Reload and try again.");
		}
	}

	/**
	 * Undoes an applied change, putting back its exact before state. A 409 when the Application (or the Offer) changed since the
	 * change was applied, or when a change applied later from the same reply is still applied.
	 */
	@Transactional
	public void undo(UUID owner, UUID applicationId, UUID resultId, int index) {
		change(owner, applicationId, resultId, index);
		var row = jdbc.sql("""
				select kind, before::text as before, resulting_version, offer_id from career_changes
				where result_id = :result and idx = :idx and owner_id = :owner and undone_at is null""")
				.param("result", resultId).param("idx", index).param("owner", owner)
				.query((rs, n) -> new Applied(rs.getString("kind"), rs.getString("before"), rs.getInt("resulting_version"),
						rs.getObject("offer_id", UUID.class)))
				.optional().orElseThrow(() -> conflict("That change is not applied."));
		// shortcut: a change applied later from the same reply blocks undoing this one until it is undone, so undo runs in reverse order; upgrade to independent undo when a reply's changes must stand alone.
		var later = jdbc.sql("""
				select exists (select 1 from career_changes l join career_changes m on m.result_id = l.result_id and m.idx = :idx
				  where l.result_id = :result and l.idx <> :idx and l.undone_at is null and l.applied_at > m.applied_at)""")
				.param("result", resultId).param("idx", index).query(Boolean.class).single();
		if (later) {
			throw conflict("Undo the change applied after this one first.");
		}
		var app = applications.get(owner, applicationId);
		switch (row.kind()) {
			case "STAGE" -> {
				requireVersion(app.version(), row.resultingVersion());
				applications.restore(owner, applicationId, json.readValue(row.before(), Snapshot.class), row.resultingVersion());
			}
			case "FOLLOW_UP" -> {
				requireVersion(app.version(), row.resultingVersion());
				var was = json.readValue(row.before(), Reminder.class);
				applications.setReminder(owner, applicationId, was.on(), was.time(), row.resultingVersion());
			}
			case "OFFER" -> {
				var current = offers.list(owner, applicationId).stream().filter(o -> o.id().equals(row.offerId())).findFirst();
				if (current.isEmpty() || current.get().version() != row.resultingVersion()) {
					throw conflict("The Offer changed since this was applied.");
				}
				var was = json.readValue(row.before(), OfferTerms.class);
				if (was == null) {
					if (!offers.delete(owner, row.offerId(), row.resultingVersion())) {
						throw conflict("The Offer changed since this was applied.");
					}
				}
				else {
					offers.update(owner, row.offerId(), was, row.resultingVersion());
				}
			}
			default -> throw new IllegalStateException("Unknown change kind " + row.kind());
		}
		jdbc.sql("update career_changes set undone_at = now() where result_id = :result and idx = :idx")
				.param("result", resultId).param("idx", index).update();
		// Undo runs in reverse order, so the change applied last before this one now leaves the Application (or the Offer) as it
		// was after that change: its recorded version becomes the current one, and the next undo still matches.
		if (row.kind().equals("OFFER")) {
			offers.list(owner, applicationId).stream().filter(o -> o.id().equals(row.offerId())).findFirst()
					.ifPresent(o -> jdbc.sql("""
							update career_changes set resulting_version = :version where result_id = :result and undone_at is null
							and idx = (select idx from career_changes where result_id = :result and undone_at is null and kind = 'OFFER'
							  and offer_id = :offer order by applied_at desc, idx desc limit 1)""")
							.param("version", o.version()).param("result", resultId).param("offer", row.offerId()).update());
		}
		else {
			jdbc.sql("""
					update career_changes set resulting_version = :version where result_id = :result and undone_at is null
					and idx = (select idx from career_changes where result_id = :result and undone_at is null
					  and kind in ('STAGE', 'FOLLOW_UP') order by applied_at desc, idx desc limit 1)""")
					.param("version", applications.get(owner, applicationId).version()).param("result", resultId).update();
		}
	}

	private static void requireVersion(int current, int resulting) {
		if (current != resulting) {
			throw conflict("The Application changed since this was applied, so it cannot be undone.");
		}
	}

	/** The state of each change of the listed replies, by index. A change with no record is still proposed. */
	public Map<UUID, Map<Integer, State>> states(UUID owner, List<UUID> resultIds) {
		var out = new HashMap<UUID, Map<Integer, State>>();
		if (resultIds.isEmpty()) {
			return out;
		}
		jdbc.sql("""
				select c.result_id, c.idx, c.undone_at is not null as undone, c.resulting_version,
				  exists (select 1 from career_changes l where l.result_id = c.result_id and l.idx <> c.idx
				    and l.undone_at is null and l.applied_at > c.applied_at) as blocked,
				  case when c.kind = 'OFFER' then (select o.version from offers o where o.id = c.offer_id)
				    else (select a.version from application_contents a where a.item_id = c.item_id) end as current_version
				from career_changes c where c.owner_id = :owner and c.result_id in (:ids)""")
				.param("owner", owner).param("ids", resultIds)
				.query((rs, n) -> {
					var undone = rs.getBoolean("undone");
					var current = rs.getObject("current_version", Integer.class);
					var canUndo = !undone && !rs.getBoolean("blocked") && current != null && current == rs.getInt("resulting_version");
					out.computeIfAbsent(rs.getObject("result_id", UUID.class), k -> new HashMap<>())
							.put(rs.getInt("idx"), new State(undone ? "UNDONE" : "APPLIED", canUndo));
					return 0;
				}).list();
		return out;
	}

}
