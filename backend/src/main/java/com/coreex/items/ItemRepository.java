package com.coreex.items;

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

	/** All live Items, narrowed to one Folder and/or one Tag when those ids are not null. */
	List<Item> findLivePage(UUID ownerId, UUID folderId, UUID tagId, int limit, long offset) {
		var query = jdbc.sql("select " + COLUMNS + " from items where " + where(folderId, tagId)
				+ " order by updated_at desc, id limit :limit offset :offset").param("owner", ownerId)
				.param("limit", limit).param("offset", offset);
		return withFilters(query, folderId, tagId).query(MAPPER).list();
	}

	long countLive(UUID ownerId, UUID folderId, UUID tagId) {
		var query = jdbc.sql("select count(*) from items where " + where(folderId, tagId)).param("owner", ownerId);
		return withFilters(query, folderId, tagId).query(Long.class).single();
	}

	// The Tag filter reads item_tags directly: a join is the simple way to filter without loading ids into memory.
	private static String where(UUID folderId, UUID tagId) {
		return "owner_id = :owner and deleted_at is null" + (folderId == null ? "" : " and folder_id = :folder")
				+ (tagId == null ? "" : " and exists (select 1 from item_tags it where it.item_id = items.id and it.tag_id = :tag)");
	}

	private static JdbcClient.StatementSpec withFilters(JdbcClient.StatementSpec query, UUID folderId, UUID tagId) {
		if (folderId != null) {
			query = query.param("folder", folderId);
		}
		return tagId == null ? query : query.param("tag", tagId);
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
