package com.coreex.export;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Every query carries the owner id and sees only live Items: nothing in the Trash, nothing of another User. */
@Repository
class ExportRepository {

	/** One Item without its text. The file facts are null for a Note. */
	record Row(UUID id, String type, String title, UUID folderId, Instant createdAt, Instant updatedAt,
			String storageKey, String mimeType, Long sizeBytes, String description) {
	}

	private static final String ROWS = """
			select i.id, i.type, i.title, i.folder_id, i.created_at, i.updated_at,
			       a.storage_key, a.mime_type, a.size_bytes, a.description
			from items i left join asset_files a on a.item_id = i.id
			where i.owner_id = :owner and i.deleted_at is null""";

	private final JdbcClient jdbc;

	ExportRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** In the order they were made, so the names a repeated title gets do not change between exports. */
	List<Row> live(UUID ownerId) {
		return jdbc.sql(ROWS + " order by i.created_at, i.id").param("owner", ownerId).query(ExportRepository::row).list();
	}

	/** One live Item of the User, or empty: how a Resume's photo is found. */
	Optional<Row> item(UUID ownerId, UUID id) {
		return jdbc.sql(ROWS + " and i.id = :id").param("owner", ownerId).param("id", id).query(ExportRepository::row)
				.optional();
	}

	/** The text of these Notes, as stored. */
	Map<UUID, String> bodies(UUID ownerId, List<UUID> noteIds) {
		var bodies = new HashMap<UUID, String>();
		if (noteIds.isEmpty()) {
			return bodies;
		}
		jdbc.sql("""
				select c.item_id, c.body from note_contents c join items i on i.id = c.item_id
				where i.owner_id = :owner and i.deleted_at is null and c.item_id in (:ids)""")
				.param("owner", ownerId).param("ids", noteIds)
				.query((rs, n) -> bodies.put(rs.getObject("item_id", UUID.class), rs.getString("body"))).list();
		return bodies;
	}

	private static Row row(ResultSet rs, int n) throws SQLException {
		return new Row(rs.getObject("id", UUID.class), rs.getString("type"), rs.getString("title"),
				rs.getObject("folder_id", UUID.class), rs.getObject("created_at", OffsetDateTime.class).toInstant(),
				rs.getObject("updated_at", OffsetDateTime.class).toInstant(), rs.getString("storage_key"),
				rs.getString("mime_type"), rs.getObject("size_bytes", Long.class), rs.getString("description"));
	}

}
