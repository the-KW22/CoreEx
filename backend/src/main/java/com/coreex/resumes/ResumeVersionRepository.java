package com.coreex.resumes;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import tools.jackson.databind.json.JsonMapper;

/** Every query carries the owner id, and none sees the versions of a deleted Resume. */
@Repository
class ResumeVersionRepository {

	/** A kept document. {@code document} is null in a list; {@code name} is null unless the User named it. */
	record Version(UUID id, String title, String name, ResumeDocument document, int sizeBytes, String editedBy, Instant savedAt) {
	}

	private static final String SELECT = """
			select v.id, v.title, v.name, %s as document, octet_length(v.document::text) as size_bytes, v.edited_by, v.saved_at
			from resume_versions v join items i on i.id = v.item_id
			where v.item_id = :id and v.owner_id = :owner and i.deleted_at is null""";

	private final JsonMapper json = JsonMapper.builder().build();

	private final RowMapper<Version> mapper = (rs, n) -> new Version(rs.getObject("id", UUID.class), rs.getString("title"),
			rs.getString("name"), rs.getString("document") == null ? null : json.readValue(rs.getString("document"), ResumeDocument.class),
			rs.getInt("size_bytes"), rs.getString("edited_by"), rs.getObject("saved_at", OffsetDateTime.class).toInstant());

	private final JdbcClient jdbc;

	private final ResumeVersionProperties properties;

	ResumeVersionRepository(JdbcClient jdbc, ResumeVersionProperties properties) {
		this.jdbc = jdbc;
		this.properties = properties;
	}

	/**
	 * Keeps the Resume's stored document, before a save at {@code seenVersion} replaces it. Always when {@code always},
	 * and always when an Agent wrote that document; otherwise only when the last kept one was written more than the gap
	 * before it. A blank Resume is never kept this way. Returns whether one was kept.
	 */
	boolean keep(UUID ownerId, UUID id, int seenVersion, boolean always) {
		return jdbc.sql("""
				insert into resume_versions (owner_id, item_id, title, document, edited_by, saved_at)
				select i.owner_id, i.id, i.title, c.document, i.edited_by, i.updated_at
				from items i join resume_contents c on c.item_id = i.id
				where i.id = :id and i.owner_id = :owner and i.type = 'RESUME' and i.deleted_at is null
				  and c.version = :version and c.plain_text <> ''
				  and (:always or i.edited_by is not null or not exists (
				        select 1 from resume_versions v
				        where v.item_id = i.id and v.saved_at > i.updated_at - make_interval(secs => :gap)))""")
				.param("id", id).param("owner", ownerId).param("version", seenVersion).param("always", always)
				.param("gap", properties.gap().toSeconds()).update() > 0;
	}

	/** Keeps the stored document under a name, whatever it holds. Empty when the Resume is missing. */
	Optional<UUID> keepNamed(UUID ownerId, UUID id, String name) {
		return jdbc.sql("""
				insert into resume_versions (owner_id, item_id, title, document, name, edited_by, saved_at)
				select i.owner_id, i.id, i.title, c.document, :name, i.edited_by, i.updated_at
				from items i join resume_contents c on c.item_id = i.id
				where i.id = :id and i.owner_id = :owner and i.type = 'RESUME' and i.deleted_at is null
				returning id""").param("id", id).param("owner", ownerId).param("name", name).query(UUID.class).optional();
	}

	// shortcut: versions count against no quota (a Resume keeps up to 50 documents of up to 1 MB), add a cap on total
	// bytes per User when database size matters.
	/** Removes the unnamed versions past the retention, and all but the newest few unnamed ones. */
	void prune(UUID ownerId, UUID id) {
		jdbc.sql("""
				delete from resume_versions
				where item_id = :id and owner_id = :owner and name is null
				  and (saved_at < now() - make_interval(secs => :retention)
				       or id not in (select id from resume_versions where item_id = :id and name is null
				                     order by saved_at desc, id limit :keep))""")
				.param("id", id).param("owner", ownerId).param("retention", properties.retention().toSeconds())
				.param("keep", properties.keep()).update();
	}

	/** Newest first, without the document. */
	List<Version> list(UUID ownerId, UUID id) {
		return jdbc.sql(SELECT.formatted("null") + " order by v.saved_at desc, v.id").param("id", id).param("owner", ownerId)
				.query(mapper).list();
	}

	Optional<Version> find(UUID ownerId, UUID id, UUID versionId) {
		return jdbc.sql(SELECT.formatted("v.document::text") + " and v.id = :version").param("id", id).param("owner", ownerId)
				.param("version", versionId).query(mapper).optional();
	}

	/** Sets or, with a null name, clears the name. False when there is no such version. */
	boolean rename(UUID ownerId, UUID id, UUID versionId, String name) {
		return jdbc.sql("""
				update resume_versions v set name = :name
				from items i
				where v.item_id = i.id and v.id = :version and v.item_id = :id and v.owner_id = :owner and i.deleted_at is null""")
				.param("name", name).param("version", versionId).param("id", id).param("owner", ownerId).update() > 0;
	}

}
