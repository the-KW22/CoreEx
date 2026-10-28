package com.coreex.items;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;
import com.coreex.folders.FolderService;

@Service
class ItemService {

	private final ItemRepository items;

	private final FolderService folders;

	ItemService(ItemRepository items, FolderService folders) {
		this.items = items;
		this.folders = folders;
	}

	/** All live Items, or only those in one Folder (a 404 if that Folder is missing, deleted or not theirs). */
	List<Item> list(UUID ownerId, UUID folderId, int page, int size) {
		requireFolder(ownerId, folderId);
		return items.findLivePage(ownerId, folderId, size, (long) page * size);
	}

	long total(UUID ownerId, UUID folderId) {
		return items.countLive(ownerId, folderId);
	}

	/** Moves an Item into a Folder, or to the top level when folderId is null. */
	@Transactional
	Item move(UUID ownerId, UUID id, UUID folderId) {
		requireFolder(ownerId, folderId);
		if (!items.moveLive(ownerId, id, folderId)) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Item.");
		}
		return items.findLive(ownerId, id).orElseThrow();
	}

	private void requireFolder(UUID ownerId, UUID folderId) {
		if (folderId != null) {
			folders.requireLive(ownerId, folderId);
		}
	}

}
