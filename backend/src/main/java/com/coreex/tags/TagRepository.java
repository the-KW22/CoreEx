package com.coreex.tags;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Every query carries the owner id. */
@Repository
class TagRepository {

	record TagCount(UUID id, String name, long itemCount) {
	}

	private static final RowMapper<Tag> MAPPER = (rs, n) -> new Tag(rs.getObject("id", UUID.class),
			rs.getString("name"));

	private final JdbcClient jdbc;

	TagRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** The User's Tag with this name (ignoring case), created when there is none. */
	Tag findOrCreate(UUID ownerId, String name) {
		jdbc.sql("insert into tags (owner_id, name) values (:owner, :name) on conflict (owner_id, (lower(name))) do nothing")
				.param("owner", ownerId).param("name", name).update();
		return jdbc.sql("select id, name from tags where owner_id = :owner and lower(name) = lower(:name)")
				.param("owner", ownerId).param("name", name).query(MAPPER).single();
	}

	Optional<Tag> find(UUID ownerId, UUID id) {
		return jdbc.sql("select id, name from tags where id = :id and owner_id = :owner").param("id", id)
				.param("owner", ownerId).query(MAPPER).optional();
	}

	/**
	 * Each Tag with the number of live Items using it; Items in the Trash do not count. It reads items directly: a
	 * join is the simple way to count without loading ids into memory.
	 */
	List<TagCount> listWithCounts(UUID ownerId) {
		return jdbc.sql("""
				select t.id, t.name,
				  (select count(*) from item_tags it join items i on i.id = it.item_id
				   where it.tag_id = t.id and i.deleted_at is null) as item_count
				from tags t where t.owner_id = :owner order by lower(t.name), t.id""").param("owner", ownerId)
				.query((rs, n) -> new TagCount(rs.getObject("id", UUID.class), rs.getString("name"),
						rs.getLong("item_count")))
				.list();
	}

	List<Tag> forItem(UUID ownerId, UUID itemId) {
		return jdbc.sql("""
				select t.id, t.name from item_tags it join tags t on t.id = it.tag_id
				where it.item_id = :item and t.owner_id = :owner order by lower(t.name), t.id""")
				.param("item", itemId).param("owner", ownerId).query(MAPPER).list();
	}

	void link(UUID itemId, UUID tagId) {
		jdbc.sql("insert into item_tags (item_id, tag_id) values (:item, :tag) on conflict do nothing")
				.param("item", itemId).param("tag", tagId).update();
	}

	void unlink(UUID itemId, UUID tagId) {
		jdbc.sql("delete from item_tags where item_id = :item and tag_id = :tag").param("item", itemId)
				.param("tag", tagId).update();
	}

	/** Throws DuplicateKeyException when the User already has another Tag with this name. */
	boolean rename(UUID ownerId, UUID id, String name) {
		return jdbc.sql("update tags set name = :name where id = :id and owner_id = :owner").param("name", name)
				.param("id", id).param("owner", ownerId).update() > 0;
	}

	boolean delete(UUID ownerId, UUID id) {
		return jdbc.sql("delete from tags where id = :id and owner_id = :owner").param("id", id)
				.param("owner", ownerId).update() > 0;
	}

}
