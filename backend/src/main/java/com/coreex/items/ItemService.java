package com.coreex.items;

import java.util.List;
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

	ItemService(ItemRepository items, FolderService folders, TagService tags) {
		this.items = items;
		this.folders = folders;
		this.tags = tags;
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

	/** Other features call this to check an Item is live and the User's; it is a 404 otherwise. */
	public void requireLive(UUID ownerId, UUID id) {
		items.findLive(ownerId, id).orElseThrow(ItemService::notFound);
	}

	/** Moves an Item into a Folder, or to the top level when folderId is null. */
	@Transactional
	Item move(UUID ownerId, UUID id, UUID folderId) {
		requireFolder(ownerId, folderId);
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
