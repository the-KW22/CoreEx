package com.coreex.notes;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Every query carries the owner id, and none sees the versions of a deleted Note. */
@Repository
class NoteVersionRepository {

	/** A kept text. {@code body} is null in a list; {@code editedBy} names the Access token that wrote it. */
	record NoteVersion(UUID id, String title, String body, int sizeBytes, String editedBy, Instant savedAt) {
	}

	private static final String SELECT = """
			select v.id, v.title, %s as body, octet_length(v.body) as size_bytes, v.edited_by, v.saved_at
			from note_versions v join items i on i.id = v.item_id
			where v.item_id = :id and v.owner_id = :owner and i.deleted_at is null""";

	private static final RowMapper<NoteVersion> MAPPER = (rs, n) -> new NoteVersion(rs.getObject("id", UUID.class),
			rs.getString("title"), rs.getString("body"), rs.getInt("size_bytes"), rs.getString("edited_by"),
			rs.getObject("saved_at", OffsetDateTime.class).toInstant());

	private final JdbcClient jdbc;

	private final NoteVersionProperties properties;

	NoteVersionRepository(JdbcClient jdbc, NoteVersionProperties properties) {
		this.jdbc = jdbc;
		this.properties = properties;
	}

	/**
	 * Keeps the Note's stored text, before a save at {@code seenVersion} replaces it. Always when {@code always}, and
	 * always when an Agent wrote that text; otherwise only when the last kept text was written more than the gap
	 * before it. An empty text is never kept. Returns whether one was kept.
	 */
	boolean keep(UUID ownerId, UUID id, int seenVersion, boolean always) {
		return jdbc.sql("""
				insert into note_versions (owner_id, item_id, title, body, edited_by, saved_at)
				select i.owner_id, i.id, i.title, c.body, i.edited_by, i.updated_at
				from items i join note_contents c on c.item_id = i.id
				where i.id = :id and i.owner_id = :owner and i.type = 'NOTE' and i.deleted_at is null
				  and c.version = :version and c.body <> ''
				  and (:always or i.edited_by is not null or not exists (
				        select 1 from note_versions v
				        where v.item_id = i.id and v.saved_at > i.updated_at - make_interval(secs => :gap)))""")
				.param("id", id).param("owner", ownerId).param("version", seenVersion).param("always", always)
				.param("gap", properties.gap().toSeconds()).update() > 0;
	}

	// shortcut: versions count against no quota (a Note keeps up to 50 whole texts of up to 1 MB), add a cap on
	// total bytes per User when database size matters.
	/** Removes the Note's versions past the retention, and all but the newest few. */
	void prune(UUID ownerId, UUID id) {
		jdbc.sql("""
				delete from note_versions
				where item_id = :id and owner_id = :owner
				  and (saved_at < now() - make_interval(secs => :retention)
				       or id not in (select id from note_versions where item_id = :id
				                     order by saved_at desc, id limit :keep))""")
				.param("id", id).param("owner", ownerId).param("retention", properties.retention().toSeconds())
				.param("keep", properties.keep()).update();
	}

	/** Newest first, without the text. */
	List<NoteVersion> list(UUID ownerId, UUID id) {
		return jdbc.sql(SELECT.formatted("null") + " order by v.saved_at desc, v.id").param("id", id)
				.param("owner", ownerId).query(MAPPER).list();
	}

	Optional<NoteVersion> find(UUID ownerId, UUID id, UUID versionId) {
		return jdbc.sql(SELECT.formatted("v.body") + " and v.id = :version").param("id", id).param("owner", ownerId)
				.param("version", versionId).query(MAPPER).optional();
	}

}
