package com.coreex.assets;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** Every query carries the owner id, and the Asset lookups never see a deleted Asset. */
@Repository
class AssetRepository {

	record Pending(UUID id, UUID ownerId, UUID folderId, String storageKey, String filename, String mimeType,
			long sizeBytes) {
	}

	private static final String SELECT = """
			select i.id, i.title, f.description, f.mime_type, f.size_bytes, i.folder_id, f.storage_key, i.updated_at
			from items i join asset_files f on f.item_id = i.id
			where i.id = :id and i.owner_id = :owner and i.type = 'ASSET' and i.deleted_at is null""";

	private static final RowMapper<Asset> ASSET = (rs, n) -> new Asset(rs.getObject("id", UUID.class),
			rs.getString("title"), rs.getString("description"), rs.getString("mime_type"), rs.getLong("size_bytes"),
			rs.getObject("folder_id", UUID.class), rs.getString("storage_key"),
			rs.getObject("updated_at", OffsetDateTime.class).toInstant());

	private static final RowMapper<Pending> PENDING = (rs, n) -> new Pending(rs.getObject("id", UUID.class),
			rs.getObject("owner_id", UUID.class), rs.getObject("folder_id", UUID.class),
			rs.getString("storage_key"), rs.getString("filename"), rs.getString("mime_type"),
			rs.getLong("size_bytes"));

	private static final String PENDING_COLUMNS = "id, owner_id, folder_id, storage_key, filename, mime_type, size_bytes";

	private final JdbcClient jdbc;

	AssetRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	UUID insertPending(UUID ownerId, UUID folderId, String storageKey, String filename, String mimeType,
			long sizeBytes, Instant createdAt) {
		return jdbc.sql("""
				insert into pending_uploads (owner_id, folder_id, storage_key, filename, mime_type, size_bytes, created_at)
				values (:owner, :folder, :key, :filename, :mime, :size, :created) returning id""")
				.param("owner", ownerId).param("folder", folderId).param("key", storageKey)
				.param("filename", filename).param("mime", mimeType).param("size", sizeBytes)
				.param("created", Timestamp.from(createdAt)).query(UUID.class).single();
	}

	Optional<Pending> findPending(UUID ownerId, UUID id) {
		return jdbc.sql("select " + PENDING_COLUMNS + " from pending_uploads where id = :id and owner_id = :owner")
				.param("id", id).param("owner", ownerId).query(PENDING).optional();
	}

	long countPending(UUID ownerId) {
		return jdbc.sql("select count(*) from pending_uploads where owner_id = :owner").param("owner", ownerId)
				.query(Long.class).single();
	}

	List<Pending> findPendingOlderThan(Instant before) {
		return jdbc.sql("select " + PENDING_COLUMNS + " from pending_uploads where created_at < :before order by created_at")
				.param("before", Timestamp.from(before)).query(PENDING).list();
	}

	boolean deletePending(UUID id) {
		return jdbc.sql("delete from pending_uploads where id = :id").param("id", id).update() > 0;
	}

	/**
	 * Turns a pending upload into an Asset with the stored object's real size, in one transaction. The delete comes
	 * first, so two confirms of the same upload cannot both create an Asset; empty means it was already confirmed.
	 */
	@Transactional
	Optional<UUID> promote(Pending pending, long actualSize) {
		if (!deletePending(pending.id())) {
			return Optional.empty();
		}
		var id = jdbc.sql("""
				insert into items (owner_id, type, title, folder_id) values (:owner, 'ASSET', :title, :folder)
				returning id""").param("owner", pending.ownerId()).param("title", pending.filename())
				.param("folder", pending.folderId()).query(UUID.class).single();
		jdbc.sql("insert into asset_files (item_id, storage_key, mime_type, size_bytes) values (:id, :key, :mime, :size)")
				.param("id", id).param("key", pending.storageKey()).param("mime", pending.mimeType())
				.param("size", actualSize).update();
		return Optional.of(id);
	}

	Optional<Asset> find(UUID ownerId, UUID id) {
		return jdbc.sql(SELECT).param("id", id).param("owner", ownerId).query(ASSET).optional();
	}

	@Transactional
	boolean update(UUID ownerId, UUID id, String title, String description) {
		var changed = jdbc.sql("""
				update items set title = :title, updated_at = now()
				where id = :id and owner_id = :owner and type = 'ASSET' and deleted_at is null""")
				.param("title", title).param("id", id).param("owner", ownerId).update();
		if (changed == 0) {
			return false;
		}
		jdbc.sql("update asset_files set description = :description where item_id = :id")
				.param("description", description).param("id", id).update();
		return true;
	}

	/** False when the Asset is missing or already deleted. The file stays in Storage until the Trash purges it. */
	boolean softDelete(UUID ownerId, UUID id) {
		return jdbc.sql("""
				update items set deleted_at = now(), trash_batch_id = gen_random_uuid()
				where id = :id and owner_id = :owner and type = 'ASSET' and deleted_at is null""").param("id", id)
				.param("owner", ownerId).update() > 0;
	}

	/** Bytes used: every READY Asset, including those in the Trash, because their files still occupy Storage. */
	long usedBytes(UUID ownerId) {
		return jdbc.sql("""
				select coalesce(sum(f.size_bytes), 0) from asset_files f join items i on i.id = f.item_id
				where i.owner_id = :owner""").param("owner", ownerId).query(Long.class).single();
	}

}
