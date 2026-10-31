package com.coreex.items;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Every query carries the owner id, and none sees a deleted Item. */
@Repository
class ItemRepository {

	private static final String COLUMNS = "id, type, title, folder_id, updated_at";

	private static final RowMapper<Item> MAPPER = (rs, n) -> new Item(rs.getObject("id", UUID.class),
			Item.Type.valueOf(rs.getString("type")), rs.getString("title"), rs.getObject("folder_id", UUID.class),
			rs.getObject("updated_at", OffsetDateTime.class).toInstant());

	private final JdbcClient jdbc;

	ItemRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** All live Items, narrowed to one Folder, one Tag and/or one type when those are not null. */
	List<Item> findLivePage(UUID ownerId, UUID folderId, UUID tagId, Item.Type type, int limit, long offset) {
		var query = jdbc.sql("select " + COLUMNS + " from items where " + where(folderId, tagId, type)
				+ " order by updated_at desc, id limit :limit offset :offset").param("owner", ownerId)
				.param("limit", limit).param("offset", offset);
		return withFilters(query, folderId, tagId, type).query(MAPPER).list();
	}

	long countLive(UUID ownerId, UUID folderId, UUID tagId, Item.Type type) {
		var query = jdbc.sql("select count(*) from items where " + where(folderId, tagId, type)).param("owner", ownerId);
		return withFilters(query, folderId, tagId, type).query(Long.class).single();
	}

	// The Tag filter reads item_tags directly: a join is the simple way to filter without loading ids into memory.
	private static String where(UUID folderId, UUID tagId, Item.Type type) {
		return "owner_id = :owner and deleted_at is null" + (folderId == null ? "" : " and folder_id = :folder")
				+ (type == null ? "" : " and type = :type")
				+ (tagId == null ? "" : " and exists (select 1 from item_tags it where it.item_id = items.id and it.tag_id = :tag)");
	}

	private static JdbcClient.StatementSpec withFilters(JdbcClient.StatementSpec query, UUID folderId, UUID tagId,
			Item.Type type) {
		if (folderId != null) {
			query = query.param("folder", folderId);
		}
		if (type != null) {
			query = query.param("type", type.name());
		}
		return tagId == null ? query : query.param("tag", tagId);
	}

	/** Live Items whose title contains the text (case-insensitive, % and _ literal), titles that start with it first. */
	List<Item> suggest(UUID ownerId, String text, int limit) {
		var escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
		return jdbc.sql("""
				select %s from items
				where owner_id = :owner and deleted_at is null and title <> '' and title ilike :contains escape '\\'
				order by (case when title ilike :prefix escape '\\' then 0 else 1 end), updated_at desc, id
				limit :limit""".formatted(COLUMNS)).param("owner", ownerId).param("contains", "%" + escaped + "%")
				.param("prefix", escaped + "%").param("limit", limit).query(MAPPER).list();
	}

	List<Item> findLiveByIds(UUID ownerId, List<UUID> ids) {
		return jdbc.sql("select " + COLUMNS + " from items where owner_id = :owner and deleted_at is null and id in (:ids)")
				.param("owner", ownerId).param("ids", ids).query(MAPPER).list();
	}

	/** Notes that the User opened the Item. False when the Item is missing, deleted or not theirs. */
	boolean markOpened(UUID ownerId, UUID id, Instant at) {
		return jdbc.sql("update items set last_opened_at = :at where id = :id and owner_id = :owner and deleted_at is null")
				.param("at", Timestamp.from(at)).param("id", id).param("owner", ownerId).update() > 0;
	}

	/** At most two ids: enough to tell "exactly one" from "none" or "several". */
	List<UUID> liveIdsWithTitle(UUID ownerId, String title) {
		return jdbc.sql("select id from items where owner_id = :owner and deleted_at is null and title = :title limit 2")
				.param("owner", ownerId).param("title", title).query(UUID.class).list();
	}

	Optional<Item> findLive(UUID ownerId, UUID id) {
		return jdbc.sql("select " + COLUMNS + " from items where id = :id and owner_id = :owner and deleted_at is null")
				.param("id", id).param("owner", ownerId).query(MAPPER).optional();
	}

	/** False when the Item is missing or deleted. A null folderId is the top level. */
	boolean moveLive(UUID ownerId, UUID id, UUID folderId) {
		return jdbc.sql("update items set folder_id = :folder where id = :id and owner_id = :owner and deleted_at is null")
				.param("folder", folderId).param("id", id).param("owner", ownerId).update() > 0;
	}

}
