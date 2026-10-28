package com.coreex.items;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class ItemRepository {

	private static final RowMapper<Item> MAPPER = (rs, n) -> new Item(rs.getObject("id", UUID.class),
			Item.Type.valueOf(rs.getString("type")), rs.getString("title"),
			rs.getObject("updated_at", OffsetDateTime.class).toInstant());

	private final JdbcClient jdbc;

	ItemRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	List<Item> findLivePage(UUID ownerId, int limit, long offset) {
		return jdbc.sql("""
				select id, type, title, updated_at from items
				where owner_id = :owner and deleted_at is null
				order by updated_at desc, id limit :limit offset :offset""").param("owner", ownerId)
				.param("limit", limit).param("offset", offset).query(MAPPER).list();
	}

	long countLive(UUID ownerId) {
		return jdbc.sql("select count(*) from items where owner_id = :owner and deleted_at is null")
				.param("owner", ownerId).query(Long.class).single();
	}

}
