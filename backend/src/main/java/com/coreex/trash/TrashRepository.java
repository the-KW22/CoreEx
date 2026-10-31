package com.coreex.trash;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * The trash operations on the {@code items} and {@code folders} tables. Trash state is those tables' own
 * {@code deleted_at} and {@code trash_batch_id} columns, so this module reads and writes them directly instead of
 * going through the items and folders features. Every query is scoped to the owner, except the purge's, which is
 * about age only.
 */
@Repository
public class TrashRepository {

	public enum Kind {
		FOLDER, NOTE, ASSET
	}

	public record Entry(Kind kind, UUID id, String title, Instant deletedAt, long folderCount, long itemCount) {
	}

	record TrashedItem(UUID id, UUID folderId) {
	}

	record TrashedFolder(UUID id, UUID parentId, UUID batchId) {
	}

	record Expired(UUID id, String storageKey) {
	}

	// What the Trash shows: the roots. A Folder is a root unless its parent was trashed in the same batch, and an Item
	// is a root unless its Folder was trashed in the same batch. The rest of a batch is shown as counts on its Folder.
	private static final String ROOTS = """
			select 'FOLDER' as kind, f.id, f.name as title, f.deleted_at,
			  (select count(*) from folders c where c.owner_id = f.owner_id and c.trash_batch_id = f.trash_batch_id
			     and c.id <> f.id) as folder_count,
			  (select count(*) from items i where i.owner_id = f.owner_id and i.trash_batch_id = f.trash_batch_id) as item_count
			from folders f
			where f.owner_id = :owner and f.deleted_at is not null
			  and not exists (select 1 from folders p where p.id = f.parent_id and p.deleted_at is not null
			                  and p.trash_batch_id = f.trash_batch_id)
			union all
			select i.type, i.id, i.title, i.deleted_at, 0, 0
			from items i
			where i.owner_id = :owner and i.deleted_at is not null
			  and not exists (select 1 from folders p where p.id = i.folder_id and p.deleted_at is not null
			                  and p.trash_batch_id = i.trash_batch_id)""";

	private final JdbcClient jdbc;

	TrashRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	List<Entry> page(UUID ownerId, int limit, long offset) {
		return jdbc.sql("select * from (" + ROOTS + ") t order by deleted_at desc, id limit :limit offset :offset")
				.param("owner", ownerId).param("limit", limit).param("offset", offset)
				.query((rs, n) -> new Entry(Kind.valueOf(rs.getString("kind")), rs.getObject("id", UUID.class),
						rs.getString("title"), rs.getObject("deleted_at", OffsetDateTime.class).toInstant(),
						rs.getLong("folder_count"), rs.getLong("item_count")))
				.list();
	}

	long count(UUID ownerId) {
		return jdbc.sql("select count(*) from (" + ROOTS + ") t").param("owner", ownerId).query(Long.class).single();
	}

	Optional<TrashedItem> findTrashedItem(UUID ownerId, UUID id) {
		return jdbc.sql("select id, folder_id from items where id = :id and owner_id = :owner and deleted_at is not null")
				.param("id", id).param("owner", ownerId)
				.query((rs, n) -> new TrashedItem(rs.getObject("id", UUID.class), rs.getObject("folder_id", UUID.class)))
				.optional();
	}

	Optional<TrashedFolder> findTrashedFolder(UUID ownerId, UUID id) {
		return jdbc.sql("""
				select id, parent_id, trash_batch_id from folders
				where id = :id and owner_id = :owner and deleted_at is not null""").param("id", id)
				.param("owner", ownerId).query((rs, n) -> new TrashedFolder(rs.getObject("id", UUID.class),
						rs.getObject("parent_id", UUID.class), rs.getObject("trash_batch_id", UUID.class)))
				.optional();
	}

	boolean restoreItem(UUID ownerId, UUID id) {
		return jdbc.sql("""
				update items set deleted_at = null, trash_batch_id = null
				where id = :id and owner_id = :owner and deleted_at is not null""").param("id", id)
				.param("owner", ownerId).update() > 0;
	}

	/** Restores every Folder and Item that was deleted in this batch, and nothing else. */
	void restoreBatch(UUID ownerId, UUID batchId) {
		jdbc.sql("update folders set deleted_at = null, trash_batch_id = null where owner_id = :owner and trash_batch_id = :batch")
				.param("owner", ownerId).param("batch", batchId).update();
		jdbc.sql("update items set deleted_at = null, trash_batch_id = null where owner_id = :owner and trash_batch_id = :batch")
				.param("owner", ownerId).param("batch", batchId).update();
	}

	/**
	 * Restores the Folder and every Folder above it that is in the Trash, so what comes back is never hidden under a
	 * trashed parent. Their other contents stay where they are. The walk uses "union" so bad data cannot loop it.
	 */
	void restoreFolderChain(UUID ownerId, UUID folderId) {
		jdbc.sql("""
				with recursive chain as (
				  select id, parent_id from folders where id = :folder and owner_id = :owner
				  union
				  select p.id, p.parent_id from folders p join chain c on p.id = c.parent_id where p.owner_id = :owner)
				update folders set deleted_at = null, trash_batch_id = null
				where id in (select id from chain) and deleted_at is not null""").param("folder", folderId)
				.param("owner", ownerId).update();
	}

	List<UUID> itemIdsInBatch(UUID ownerId, UUID batchId) {
		return jdbc.sql("select id from items where owner_id = :owner and trash_batch_id = :batch")
				.param("owner", ownerId).param("batch", batchId).query(UUID.class).list();
	}

	List<UUID> folderIdsInBatch(UUID ownerId, UUID batchId) {
		return jdbc.sql("select id from folders where owner_id = :owner and trash_batch_id = :batch")
				.param("owner", ownerId).param("batch", batchId).query(UUID.class).list();
	}

	List<UUID> allTrashedItemIds(UUID ownerId) {
		return jdbc.sql("select id from items where owner_id = :owner and deleted_at is not null")
				.param("owner", ownerId).query(UUID.class).list();
	}

	List<UUID> allTrashedFolderIds(UUID ownerId) {
		return jdbc.sql("select id from folders where owner_id = :owner and deleted_at is not null")
				.param("owner", ownerId).query(UUID.class).list();
	}

	List<Expired> expiredItems(Instant before, int limit) {
		return jdbc.sql("""
				select i.id, f.storage_key from items i left join asset_files f on f.item_id = i.id
				where i.deleted_at < :before order by i.deleted_at, i.id limit :limit""")
				.param("before", Timestamp.from(before)).param("limit", limit)
				.query((rs, n) -> new Expired(rs.getObject("id", UUID.class), rs.getString("storage_key"))).list();
	}

	List<UUID> expiredFolderIds(Instant before, int limit) {
		return jdbc.sql("select id from folders where deleted_at < :before order by deleted_at, id limit :limit")
				.param("before", Timestamp.from(before)).param("limit", limit).query(UUID.class).list();
	}

	/** The storage keys of the Assets among these Items. */
	List<String> assetKeys(List<UUID> itemIds) {
		return jdbc.sql("select storage_key from asset_files where item_id = any(:ids)").param("ids", array(itemIds))
				.query(String.class).list();
	}

	/**
	 * Deletes these Items and Folders for good, in one transaction. Notes, Tag links and asset rows go with their Item
	 * (so the quota drops), and so do the Link rows that point at the Item. A Folder that was trashed on its own
	 * inside a deleted Folder moves to the top level instead of being swept away by the foreign-key cascade.
	 * Only rows that are still in the Trash are deleted: something restored since the ids were read is left alone.
	 */
	@Transactional
	void removeForGood(List<UUID> itemIds, List<UUID> folderIds) {
		if (!itemIds.isEmpty()) {
			jdbc.sql("delete from links where target_id = any(:ids)").param("ids", array(itemIds)).update();
			jdbc.sql("delete from items where id = any(:ids) and deleted_at is not null").param("ids", array(itemIds))
					.update();
		}
		if (!folderIds.isEmpty()) {
			jdbc.sql("update folders set parent_id = null where parent_id = any(:ids) and not (id = any(:ids))")
					.param("ids", array(folderIds)).update();
			jdbc.sql("delete from folders where id = any(:ids) and deleted_at is not null").param("ids", array(folderIds))
					.update();
		}
	}

	private static UUID[] array(List<UUID> ids) {
		return ids.toArray(new UUID[0]);
	}

}
