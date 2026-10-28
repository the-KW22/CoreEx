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

	/** All live Items, or only those in the given Folder when folderId is not null. */
	List<Item> findLivePage(UUID ownerId, UUID folderId, int limit, long offset) {
		var sql = "select " + COLUMNS + " from items where owner_id = :owner and deleted_at is null"
				+ (folderId == null ? "" : " and folder_id = :folder")
				+ " order by updated_at desc, id limit :limit offset :offset";
		var query = jdbc.sql(sql).param("owner", ownerId).param("limit", limit).param("offset", offset);
		return (folderId == null ? query : query.param("folder", folderId)).query(MAPPER).list();
	}

	long countLive(UUID ownerId, UUID folderId) {
		var sql = "select count(*) from items where owner_id = :owner and deleted_at is null"
				+ (folderId == null ? "" : " and folder_id = :folder");
		var query = jdbc.sql(sql).param("owner", ownerId);
		return (folderId == null ? query : query.param("folder", folderId)).query(Long.class).single();
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
