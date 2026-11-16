package com.coreex.applications;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.coreex.applications.Application.CloseReason;
import com.coreex.applications.Application.Stage;
import com.coreex.applications.Application.TimelineEntry;

import tools.jackson.databind.json.JsonMapper;

/** Every query carries the owner id, and none sees a deleted Application. */
@Repository
class ApplicationRepository {

	private static final String FROM = """
			from items i join application_contents c on c.item_id = i.id
			where i.owner_id = :owner and i.type = 'APPLICATION' and i.deleted_at is null""";

	private static final String COLUMNS = """
			select i.id, i.title, c.title_auto, c.company, c.role, c.location, c.posting_url, c.posting_text, c.stage,
			c.close_reason, c.applied_on, c.reminder_on, c.reminder_time, c.timeline::text as timeline, c.version, i.folder_id, i.created_at, i.updated_at """;

	private final JsonMapper json = JsonMapper.builder().build();

	private final RowMapper<Application> mapper = (rs, n) -> new Application(rs.getObject("id", UUID.class),
			rs.getString("title"), rs.getBoolean("title_auto"), rs.getString("company"), rs.getString("role"),
			rs.getString("location"), rs.getString("posting_url"), rs.getString("posting_text"),
			Stage.valueOf(rs.getString("stage")), closeReason(rs.getString("close_reason")), instant(rs.getObject("applied_on", OffsetDateTime.class)),
			rs.getObject("reminder_on", LocalDate.class), rs.getObject("reminder_time", LocalTime.class), List.of(json.readValue(rs.getString("timeline"), TimelineEntry[].class)), rs.getInt("version"),
			rs.getObject("folder_id", UUID.class), instant(rs.getObject("created_at", OffsetDateTime.class)),
			instant(rs.getObject("updated_at", OffsetDateTime.class)));

	private final JdbcClient jdbc;

	ApplicationRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	private static CloseReason closeReason(String name) {
		return name == null ? null : CloseReason.valueOf(name);
	}

	private static Instant instant(OffsetDateTime time) {
		return time == null ? null : time.toInstant();
	}

	/** A null {@code wanted} id means a new one; an id that is already used by any Item makes this return empty. */
	Optional<UUID> insert(UUID ownerId, UUID wanted, String title, String company, String role, String location,
			String postingUrl, String postingText, Stage stage, Instant appliedOn, List<TimelineEntry> timeline) {
		var made = jdbc.sql("""
				insert into items (id, owner_id, type, title)
				values (coalesce(:wanted, gen_random_uuid()), :owner, 'APPLICATION', :title)
				on conflict (id) do nothing returning id""").param("wanted", wanted).param("owner", ownerId)
				.param("title", title).query(UUID.class).optional();
		if (made.isEmpty()) {
			return made;
		}
		var id = made.get();
		jdbc.sql("""
				insert into application_contents (item_id, company, role, location, posting_url, posting_text, stage,
				applied_on, timeline)
				values (:id, :company, :role, :location, :url, :text, :stage, :applied, :timeline::jsonb)""")
				.param("id", id).param("company", company).param("role", role).param("location", location)
				.param("url", postingUrl).param("text", postingText).param("stage", stage.name())
				.param("applied", appliedOn == null ? null : Timestamp.from(appliedOn))
				.param("timeline", json.writeValueAsString(timeline)).update();
		return made;
	}

	Optional<Application> find(UUID ownerId, UUID id) {
		return jdbc.sql(COLUMNS + " " + FROM + " and i.id = :id").param("owner", ownerId).param("id", id).query(mapper)
				.optional();
	}

	List<Application> findAll(UUID ownerId) {
		return jdbc.sql(COLUMNS + " " + FROM + " order by i.updated_at desc, i.id").param("owner", ownerId).query(mapper)
				.list();
	}

	/** False when the Application is missing or its stored version is not the one the caller saw. */
	boolean saveFields(UUID ownerId, UUID id, int seenVersion, String title, boolean titleAuto, String company,
			String role, String location, String postingUrl, String postingText) {
		var saved = jdbc.sql("""
				update application_contents c set company = :company, role = :role, location = :location,
				posting_url = :url, posting_text = :text, title_auto = :auto, version = c.version + 1
				from items i
				where c.item_id = i.id and i.id = :id and i.owner_id = :owner and i.type = 'APPLICATION'
				  and i.deleted_at is null and c.version = :version""").param("company", company).param("role", role)
				.param("location", location).param("url", postingUrl).param("text", postingText)
				.param("auto", titleAuto).param("id", id).param("owner", ownerId).param("version", seenVersion).update();
		if (saved == 0) {
			return false;
		}
		touch(id, title);
		return true;
	}

	/** False when the Application is missing or its stored version is not the one the caller saw. */
	boolean saveTimeline(UUID ownerId, UUID id, int seenVersion, Stage stage, CloseReason closeReason,
			Instant appliedOn, List<TimelineEntry> timeline, boolean clearReminder) {
		var saved = jdbc.sql("""
				update application_contents c set stage = :stage, close_reason = :reason, applied_on = :applied,
				timeline = :timeline::jsonb, version = c.version + 1,
				reminder_on = case when :clear then null else c.reminder_on end,
				reminder_time = case when :clear then null else c.reminder_time end
				from items i
				where c.item_id = i.id and i.id = :id and i.owner_id = :owner and i.type = 'APPLICATION'
				  and i.deleted_at is null and c.version = :version""").param("stage", stage.name())
				.param("clear", clearReminder).param("reason", closeReason == null ? null : closeReason.name())
				.param("applied", appliedOn == null ? null : Timestamp.from(appliedOn))
				.param("timeline", json.writeValueAsString(timeline)).param("id", id).param("owner", ownerId)
				.param("version", seenVersion).update();
		if (saved == 0) {
			return false;
		}
		touch(id, null);
		return true;
	}

	/** False when the Application is missing or its stored version is not the one the caller saw. */
	boolean saveReminder(UUID ownerId, UUID id, int seenVersion, LocalDate on, LocalTime time) {
		var saved = jdbc.sql("""
				update application_contents c set reminder_on = :on, reminder_time = :time, version = c.version + 1
				from items i
				where c.item_id = i.id and i.id = :id and i.owner_id = :owner and i.type = 'APPLICATION'
				  and i.deleted_at is null and c.version = :version""").param("on", on).param("time", time)
				.param("id", id).param("owner", ownerId).param("version", seenVersion).update();
		if (saved == 0) {
			return false;
		}
		touch(id, null);
		return true;
	}

	/** False when the Application is missing, not the User's or already in the Trash. */
	boolean softDelete(UUID ownerId, UUID id, Instant at) {
		return jdbc.sql("""
				update items set deleted_at = :at, trash_batch_id = gen_random_uuid()
				where id = :id and owner_id = :owner and type = 'APPLICATION' and deleted_at is null""")
				.param("at", Timestamp.from(at)).param("id", id).param("owner", ownerId).update() > 0;
	}

	/** Bumps the Item's time, and sets its title when there is one. */
	private void touch(UUID id, String title) {
		jdbc.sql("update items set title = coalesce(:title, title), edited_by = null, updated_at = now() where id = :id")
				.param("title", title).param("id", id).update();
	}

}
