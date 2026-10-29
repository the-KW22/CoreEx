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
			select i.id, i.title, c.body, c.version, i.folder_id, i.created_at, i.updated_at
			from items i join note_contents c on c.item_id = i.id
			where i.id = :id and i.owner_id = :owner and i.type = 'NOTE' and i.deleted_at is null""";

	private static final RowMapper<Note> MAPPER = (rs, n) -> new Note(rs.getObject("id", UUID.class),
			rs.getString("title"), rs.getString("body"), rs.getInt("version"), rs.getObject("folder_id", UUID.class),
			rs.getObject("created_at", OffsetDateTime.class).toInstant(),
			rs.getObject("updated_at", OffsetDateTime.class).toInstant());

	private final JdbcClient jdbc;

	NoteRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	UUID insert(UUID ownerId, UUID folderId, String title, String body) {
		var id = jdbc.sql("""
				insert into items (owner_id, type, title, folder_id) values (:owner, 'NOTE', :title, :folder)
				returning id""").param("owner", ownerId).param("title", title).param("folder", folderId)
				.query(UUID.class).single();
		jdbc.sql("insert into note_contents (item_id, body) values (:id, :body)").param("id", id).param("body", body)
				.update();
		return id;
	}

	Optional<Note> find(UUID ownerId, UUID id) {
		return jdbc.sql(SELECT).param("id", id).param("owner", ownerId).query(MAPPER).optional();
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
		jdbc.sql("update items set title = :title, updated_at = now() where id = :id").param("title", title)
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
