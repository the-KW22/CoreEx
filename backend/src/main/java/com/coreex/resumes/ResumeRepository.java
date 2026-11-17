package com.coreex.resumes;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import tools.jackson.databind.json.JsonMapper;

/** Every query carries the owner id, and none sees a deleted Resume. */
@Repository
class ResumeRepository {

	private static final String FROM = """
			from items i join resume_contents c on c.item_id = i.id
			where i.owner_id = :owner and i.type = 'RESUME' and i.deleted_at is null""";

	/** One row of the list: no document, so a page of Resumes stays small. */
	record Summary(UUID id, String title, UUID folderId, Instant createdAt, Instant updatedAt) {
	}

	private final JsonMapper json = JsonMapper.builder().build();

	private final JdbcClient jdbc;

	ResumeRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	String toJson(ResumeDocument document) {
		return json.writeValueAsString(document);
	}

	/** A null {@code wanted} id means a new one; an id already used by any Item makes this return empty. */
	Optional<UUID> insert(UUID ownerId, UUID wanted, String title, String document, String plain, String markdown) {
		var made = jdbc.sql("""
				insert into items (id, owner_id, type, title)
				values (coalesce(:wanted, gen_random_uuid()), :owner, 'RESUME', :title)
				on conflict (id) do nothing returning id""").param("wanted", wanted).param("owner", ownerId)
				.param("title", title).query(UUID.class).optional();
		made.ifPresent(id -> jdbc.sql("""
				insert into resume_contents (item_id, document, plain_text, markdown) values (:id, :doc::jsonb, :plain, :md)""")
				.param("id", id).param("doc", document).param("plain", plain).param("md", markdown).update());
		return made;
	}

	Optional<Resume> find(UUID ownerId, UUID id) {
		return jdbc.sql("select i.id, i.title, c.document::text as document, c.version, c.locked, i.folder_id, i.created_at, i.updated_at "
				+ FROM + " and i.id = :id").param("owner", ownerId).param("id", id)
				.query((rs, n) -> new Resume(rs.getObject("id", UUID.class), rs.getString("title"),
						json.readValue(rs.getString("document"), ResumeDocument.class), rs.getInt("version"), rs.getBoolean("locked"),
						rs.getObject("folder_id", UUID.class), rs.getObject("created_at", OffsetDateTime.class).toInstant(),
						rs.getObject("updated_at", OffsetDateTime.class).toInstant()))
				.optional();
	}

	// A title that contains the text, in any case; % and _ in the text are letters.
	private static final String MATCH = " and (:q = '' or i.title ilike :contains escape '\\')";

	private static String contains(String q) {
		return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
	}

	/** Newest change first by default; "name" and "created" are the other orders. Anything else is the default. */
	private static String order(String sort) {
		return switch (sort) {
			case "name" -> " order by lower(i.title), i.id";
			case "created" -> " order by i.created_at desc, i.id";
			default -> " order by i.updated_at desc, i.id";
		};
	}

	List<Summary> list(UUID ownerId, String q, String sort, int limit, long offset) {
		return jdbc.sql("select i.id, i.title, i.folder_id, i.created_at, i.updated_at " + FROM + MATCH + order(sort)
				+ " limit :limit offset :offset").param("owner", ownerId).param("q", q).param("contains", contains(q))
				.param("limit", limit).param("offset", offset)
				.query((rs, n) -> new Summary(rs.getObject("id", UUID.class), rs.getString("title"),
						rs.getObject("folder_id", UUID.class), rs.getObject("created_at", OffsetDateTime.class).toInstant(),
						rs.getObject("updated_at", OffsetDateTime.class).toInstant()))
				.list();
	}

	/** False when the Resume is missing, not the User's or already in the Trash. */
	boolean softDelete(UUID ownerId, UUID id, Instant at) {
		return jdbc.sql("""
				update items set deleted_at = :at, trash_batch_id = gen_random_uuid()
				where id = :id and owner_id = :owner and type = 'RESUME' and deleted_at is null""")
				.param("at", java.sql.Timestamp.from(at)).param("id", id).param("owner", ownerId).update() > 0;
	}

	/** True when the Asset is a live image of this User's. */
	boolean isImageAsset(UUID ownerId, UUID assetId) {
		return jdbc.sql("""
				select count(*) from asset_files f join items i on i.id = f.item_id
				where f.item_id = :asset and i.owner_id = :owner and i.type = 'ASSET' and i.deleted_at is null
				  and f.mime_type like 'image/%'""").param("asset", assetId).param("owner", ownerId).query(Long.class).single() > 0;
	}

	long count(UUID ownerId, String q) {
		return jdbc.sql("select count(*) " + FROM + MATCH).param("owner", ownerId).param("q", q).param("contains", contains(q))
				.query(Long.class).single();
	}

	/** False when the Resume is missing or its stored version is not the one the caller saw. */
	boolean save(UUID ownerId, UUID id, int seenVersion, String title, String document, String plain, String markdown) {
		var saved = jdbc.sql("""
				update resume_contents c set document = :doc::jsonb, plain_text = :plain, markdown = :md, version = c.version + 1
				from items i
				where c.item_id = i.id and i.id = :id and i.owner_id = :owner and i.type = 'RESUME'
				  and i.deleted_at is null and c.version = :version and not c.locked""").param("doc", document).param("plain", plain)
				.param("md", markdown).param("id", id).param("owner", ownerId).param("version", seenVersion).update();
		if (saved == 0) {
			return false;
		}
		jdbc.sql("""
				update cover_letter_contents c
				set document = jsonb_set(jsonb_set(c.document, '{sender}', (:doc::jsonb)->'basics'), '{design}', (:doc::jsonb)->'metadata')
				from items i where c.item_id = i.id and i.owner_id = :owner and c.linked_resume_id = :id
				""").param("doc", document).param("owner", ownerId).param("id", id).update();
		jdbc.sql("""
				update items i set updated_at = now() from cover_letter_contents c
				where c.item_id = i.id and i.owner_id = :owner and c.linked_resume_id = :id and i.deleted_at is null
				""").param("owner", ownerId).param("id", id).update();
		return rename(ownerId, id, title);
	}

	/** False when the Resume is missing, not the User's or locked. */
	boolean rename(UUID ownerId, UUID id, String title) {
		return jdbc.sql("""
				update items i set title = :title, edited_by = null, updated_at = now()
				from resume_contents c
				where c.item_id = i.id and i.id = :id and i.owner_id = :owner and i.type = 'RESUME'
				  and i.deleted_at is null and not c.locked""")
				.param("title", title).param("id", id).param("owner", ownerId).update() > 0;
	}

	/** False when the Resume is missing or not the User's. */
	boolean setLocked(UUID ownerId, UUID id, boolean locked) {
		return jdbc.sql("""
				update resume_contents c set locked = :locked
				from items i
				where c.item_id = i.id and i.id = :id and i.owner_id = :owner and i.type = 'RESUME' and i.deleted_at is null""")
				.param("locked", locked).param("id", id).param("owner", ownerId).update() > 0;
	}

}
