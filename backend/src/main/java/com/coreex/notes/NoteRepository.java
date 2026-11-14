package com.coreex.notes;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Every query carries the owner id, and none sees a deleted Note. */
@Repository
class NoteRepository {

	private static final String SELECT = """
			select i.id, i.title, c.body, c.version, i.folder_id, i.created_at, i.updated_at, i.edited_by
			from items i join note_contents c on c.item_id = i.id
			where i.id = :id and i.owner_id = :owner and i.type = 'NOTE' and i.deleted_at is null""";

	private static final RowMapper<Note> MAPPER = (rs, n) -> new Note(rs.getObject("id", UUID.class),
			rs.getString("title"), rs.getString("body"), rs.getInt("version"), rs.getObject("folder_id", UUID.class),
			rs.getObject("created_at", OffsetDateTime.class).toInstant(),
			rs.getObject("updated_at", OffsetDateTime.class).toInstant(), rs.getString("edited_by"));

	private final JdbcClient jdbc;

	NoteRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** A null {@code id} lets the database choose one. Empty when the id is given and already taken, by anyone. */
	Optional<UUID> insert(UUID ownerId, UUID folderId, String title, String body, UUID id) {
		var made = jdbc.sql("""
				insert into items (id, owner_id, type, title, folder_id)
				values (coalesce(:id, gen_random_uuid()), :owner, 'NOTE', :title, :folder)
				on conflict (id) do nothing
				returning id""").param("id", id).param("owner", ownerId).param("title", title)
				.param("folder", folderId).query(UUID.class).optional();
		made.ifPresent(noteId -> jdbc.sql("insert into note_contents (item_id, body) values (:id, :body)")
				.param("id", noteId).param("body", body).update());
		return made;
	}

	Optional<Note> find(UUID ownerId, UUID id) {
		return jdbc.sql(SELECT).param("id", id).param("owner", ownerId).query(MAPPER).optional();
	}

	/** What changed about a Note, without its text: the save counter, when, and which Access token wrote it (null: the User). */
	record Latest(int version, Instant updatedAt, String editedBy) {
	}

	Optional<Latest> latest(UUID ownerId, UUID id) {
		return jdbc.sql("""
				select c.version, i.updated_at, i.edited_by
				from items i join note_contents c on c.item_id = i.id
				where i.id = :id and i.owner_id = :owner and i.type = 'NOTE' and i.deleted_at is null""")
				.param("id", id).param("owner", ownerId)
				.query((rs, n) -> new Latest(rs.getInt("version"),
						rs.getObject("updated_at", OffsetDateTime.class).toInstant(), rs.getString("edited_by")))
				.optional();
	}

	/** False when the Note is missing or its stored version is not the one the caller saw. */
	boolean save(UUID ownerId, UUID id, String title, String body, int seenVersion) {
		var saved = jdbc.sql("""
				update note_contents c set body = :body, version = c.version + 1
				from items i
				where c.item_id = i.id and i.id = :id and i.owner_id = :owner and i.type = 'NOTE'
				  and i.deleted_at is null and c.version = :version""").param("body", body).param("id", id)
				.param("owner", ownerId).param("version", seenVersion).update();
		if (saved == 0) {
			return false;
		}
		jdbc.sql("update items set title = :title, edited_by = null, updated_at = now() where id = :id").param("title", title)
				.param("id", id).update();
		return true;
	}

	/** False when the Note is missing or already deleted. {@code at} is when it went to the Trash. */
	boolean softDelete(UUID ownerId, UUID id, Instant at) {
		return jdbc.sql("""
				update items set deleted_at = :at, trash_batch_id = gen_random_uuid()
				where id = :id and owner_id = :owner and type = 'NOTE' and deleted_at is null""").param("at", Timestamp.from(at))
				.param("id", id).param("owner", ownerId).update() > 0;
	}

}
