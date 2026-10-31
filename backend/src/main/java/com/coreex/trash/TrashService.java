package com.coreex.trash;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;
import com.coreex.storage.Storage;
import com.coreex.trash.TrashRepository.Entry;

/**
 * What is in the Trash and what can be done with it. Permanent deletion removes the Storage objects first and the
 * database rows second, so a Storage failure leaves everything in place and trying again is safe.
 */
@Service
public class TrashService {

	public record Row(Entry entry, long daysRemaining) {
	}

	private final TrashRepository trash;

	private final Storage storage;

	private final TrashProperties properties;

	private final Clock clock;

	TrashService(TrashRepository trash, Storage storage, TrashProperties properties, Clock clock) {
		this.trash = trash;
		this.storage = storage;
		this.properties = properties;
		this.clock = clock;
	}

	public List<Row> list(UUID ownerId, int page, int size) {
		return trash.page(ownerId, size, (long) page * size).stream()
				.map(entry -> new Row(entry, daysRemaining(entry.deletedAt()))).toList();
	}

	public long total(UUID ownerId) {
		return trash.count(ownerId);
	}

	/** Whole days left before the purge: a thing deleted 29.5 days ago has 1 day left. Never below 0. */
	private long daysRemaining(Instant deletedAt) {
		var left = properties.retention().toDays() - Duration.between(deletedAt, clock.instant()).toDays();
		return Math.max(0, left);
	}

	/** Brings the Item back, and any trashed Folders above it (but not what else was in them). */
	@Transactional
	public void restoreItem(UUID ownerId, UUID id) {
		var item = trash.findTrashedItem(ownerId, id).orElseThrow(TrashService::notInTrash);
		trash.restoreItem(ownerId, id);
		if (item.folderId() != null) {
			trash.restoreFolderChain(ownerId, item.folderId());
		}
	}

	/** Brings back exactly what was deleted with the Folder, and any trashed Folders above it. */
	@Transactional
	public void restoreFolder(UUID ownerId, UUID id) {
		var folder = trash.findTrashedFolder(ownerId, id).orElseThrow(TrashService::notInTrash);
		trash.restoreBatch(ownerId, folder.batchId());
		if (folder.parentId() != null) {
			trash.restoreFolderChain(ownerId, folder.parentId());
		}
	}

	void deleteItemForGood(UUID ownerId, UUID id) {
		trash.findTrashedItem(ownerId, id).orElseThrow(TrashService::notInTrash);
		removeForGood(List.of(id), List.of());
	}

	/** Deletes the Folder and everything that was deleted with it; things trashed separately stay in the Trash. */
	void deleteFolderForGood(UUID ownerId, UUID id) {
		var folder = trash.findTrashedFolder(ownerId, id).orElseThrow(TrashService::notInTrash);
		removeForGood(trash.itemIdsInBatch(ownerId, folder.batchId()), trash.folderIdsInBatch(ownerId, folder.batchId()));
	}

	void empty(UUID ownerId) {
		removeForGood(trash.allTrashedItemIds(ownerId), trash.allTrashedFolderIds(ownerId));
	}

	/** Storage first (a failure stops here and changes nothing), then the rows. */
	private void removeForGood(List<UUID> itemIds, List<UUID> folderIds) {
		// shortcut: one Storage request per file, so emptying a Trash of thousands of files is slow; use Storage's bulk
		// delete (up to 1000 per call) if that ever happens.
		if (!itemIds.isEmpty()) {
			trash.assetKeys(itemIds).forEach(storage::delete);
		}
		trash.removeForGood(itemIds, folderIds);
	}

	private static ApiException notInTrash() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such thing in your Trash.");
	}

}
