package com.coreex.items;

import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;
import com.coreex.folders.FolderService;
import com.coreex.tags.TagService;

@Service
public class ItemService {

	private final ItemRepository items;

	private final FolderService folders;

	private final TagService tags;

	private final Clock clock;

	ItemService(ItemRepository items, FolderService folders, TagService tags, Clock clock) {
		this.items = items;
		this.folders = folders;
		this.tags = tags;
		this.clock = clock;
	}

	/**
	 * All live Items, or only those in one Folder and/or with one Tag (a 404 if that Folder or Tag is missing, deleted
	 * or not theirs).
	 */
	List<Item> list(UUID ownerId, UUID folderId, UUID tagId, int page, int size) {
		requireFilters(ownerId, folderId, tagId);
		return items.findLivePage(ownerId, folderId, tagId, size, (long) page * size);
	}

	long total(UUID ownerId, UUID folderId, UUID tagId) {
		return items.countLive(ownerId, folderId, tagId);
	}

	/** Live Items whose title contains the text, titles starting with it first. */
	public List<Item> suggest(UUID ownerId, String text, int limit) {
		return items.suggest(ownerId, text, limit);
	}

	/** The User's live Items among these ids; others (missing, trashed, not theirs) are simply left out. */
	public List<Item> findLive(UUID ownerId, List<UUID> ids) {
		return ids.isEmpty() ? List.of() : items.findLiveByIds(ownerId, ids);
	}

	/** The id of the User's one live Item with exactly this title, or empty when there is none or several. */
	public Optional<UUID> soleLiveIdWithTitle(UUID ownerId, String title) {
		var ids = items.liveIdsWithTitle(ownerId, title);
		return ids.size() == 1 ? Optional.of(ids.get(0)) : Optional.empty();
	}

	/** Other features call this to check an Item is live and the User's; it is a 404 otherwise. */
	public void requireLive(UUID ownerId, UUID id) {
		items.findLive(ownerId, id).orElseThrow(ItemService::notFound);
	}

	/** Records that the User opened the Item (for "recently opened"); a 404 unless it is live and theirs. */
	void markOpened(UUID ownerId, UUID id) {
		if (!items.markOpened(ownerId, id, clock.instant())) {
			throw notFound();
		}
	}

	/** Moves an Item into a Folder, or to the top level when folderId is null. */
	@Transactional
	Item move(UUID ownerId, UUID id, UUID folderId) {
		if (folderId != null) {
			folders.requireLiveForWrite(ownerId, folderId);
		}
		if (!items.moveLive(ownerId, id, folderId)) {
			throw notFound();
		}
		return items.findLive(ownerId, id).orElseThrow();
	}

	private void requireFilters(UUID ownerId, UUID folderId, UUID tagId) {
		requireFolder(ownerId, folderId);
		if (tagId != null) {
			tags.requireTag(ownerId, tagId);
		}
	}

	private void requireFolder(UUID ownerId, UUID folderId) {
		if (folderId != null) {
			folders.requireLive(ownerId, folderId);
		}
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Item.");
	}

}
