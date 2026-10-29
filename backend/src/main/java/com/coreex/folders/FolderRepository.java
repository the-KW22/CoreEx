package com.coreex.folders;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Every query carries the owner id, and none sees a deleted Folder. */
@Repository
class FolderRepository {

	private static final RowMapper<Folder> MAPPER = (rs, n) -> new Folder(rs.getObject("id", UUID.class),
			rs.getObject("parent_id", UUID.class), rs.getString("name"));

	private final JdbcClient jdbc;

	FolderRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	Folder insert(UUID ownerId, UUID parentId, String name) {
		return jdbc.sql("""
				insert into folders (owner_id, parent_id, name) values (:owner, :parent, :name)
				returning id, parent_id, name""").param("owner", ownerId).param("parent", parentId)
				.param("name", name).query(MAPPER).single();
	}

	Optional<Folder> findLive(UUID ownerId, UUID id) {
		return jdbc.sql("select id, parent_id, name from folders where id = :id and owner_id = :owner and deleted_at is null")
				.param("id", id).param("owner", ownerId).query(MAPPER).optional();
	}

	List<Folder> listLive(UUID ownerId) {
		return jdbc.sql("""
				select id, parent_id, name from folders where owner_id = :owner and deleted_at is null
				order by lower(name), id""").param("owner", ownerId).query(MAPPER).list();
	}

	boolean rename(UUID ownerId, UUID id, String name) {
		return jdbc.sql("""
				update folders set name = :name, updated_at = now()
				where id = :id and owner_id = :owner and deleted_at is null""").param("name", name).param("id", id)
				.param("owner", ownerId).update() > 0;
	}

	boolean move(UUID ownerId, UUID id, UUID parentId) {
		return jdbc.sql("""
				update folders set parent_id = :parent, updated_at = now()
				where id = :id and owner_id = :owner and deleted_at is null""").param("parent", parentId)
				.param("id", id).param("owner", ownerId).update() > 0;
	}

	/**
	 * The Folder and all its live descendants, at any depth. Empty when the Folder is missing or deleted. "union"
	 * (not "union all") makes the walk stop even if bad data ever formed a cycle.
	 */
	List<UUID> liveSubtreeIds(UUID ownerId, UUID id) {
		return jdbc.sql("""
				with recursive subtree as (
				  select id from folders where id = :id and owner_id = :owner and deleted_at is null
				  union
				  select c.id from folders c join subtree s on c.parent_id = s.id
				  where c.owner_id = :owner and c.deleted_at is null)
				select id from subtree""").param("id", id).param("owner", ownerId).query(UUID.class).list();
	}

	long countLiveItems(UUID ownerId, List<UUID> folderIds) {
		return jdbc.sql("select count(*) from items where owner_id = :owner and deleted_at is null and folder_id in (:ids)")
				.param("owner", ownerId).param("ids", folderIds).query(Long.class).single();
	}

	/** Puts the given Folders, and the live Items in them, in the Trash under one batch. */
	void trash(UUID ownerId, List<UUID> folderIds, UUID batchId, Instant at) {
		jdbc.sql("""
				update items set deleted_at = :at, trash_batch_id = :batch
				where owner_id = :owner and deleted_at is null and folder_id in (:ids)""").param("at", Timestamp.from(at))
				.param("batch", batchId).param("owner", ownerId).param("ids", folderIds).update();
		jdbc.sql("update folders set deleted_at = :at, trash_batch_id = :batch where owner_id = :owner and id in (:ids)")
				.param("at", Timestamp.from(at)).param("batch", batchId).param("owner", ownerId).param("ids", folderIds)
				.update();
	}

}
