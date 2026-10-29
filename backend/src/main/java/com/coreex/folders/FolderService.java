package com.coreex.folders;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;

@Service
public class FolderService {

	/** What a Folder holds below it: the Folders inside it (not itself) and the live Items in it or them. */
	public record Summary(long folderCount, long itemCount) {
	}

	private final FolderRepository folders;

	private final Clock clock;

	FolderService(FolderRepository folders, Clock clock) {
		this.folders = folders;
		this.clock = clock;
	}

	/** Other features call this to check a Folder exists, is live and is the User's; it is a 404 otherwise. */
	public Folder requireLive(UUID ownerId, UUID id) {
		return folders.findLive(ownerId, id).orElseThrow(FolderService::notFound);
	}

	/**
	 * For writes that put something into the Folder: also locks it until the caller's transaction ends, so a Folder
	 * deleted at that very moment is seen as gone and nothing lands inside a trashed Folder.
	 */
	public Folder requireLiveForWrite(UUID ownerId, UUID id) {
		return folders.findLiveForShare(ownerId, id).orElseThrow(FolderService::notFound);
	}

	/** Every live Folder's id with its path from the top level, such as "Work / CoreEx". */
	public Map<UUID, String> paths(UUID ownerId) {
		var byId = new HashMap<UUID, Folder>();
		folders.listLive(ownerId).forEach(f -> byId.put(f.id(), f));
		var paths = new HashMap<UUID, String>();
		for (var folder : byId.values()) {
			var names = new ArrayList<String>();
			// A parent chain cannot loop (moves are checked), but stop anyway if bad data ever did.
			for (var at = folder; at != null && names.size() <= byId.size(); at = byId.get(at.parentId())) {
				names.add(0, at.name());
			}
			paths.put(folder.id(), String.join(" / ", names));
		}
		return paths;
	}

	Folder create(UUID ownerId, UUID parentId, String name) {
		if (parentId != null) {
			requireLive(ownerId, parentId);
		}
		return folders.insert(ownerId, parentId, name);
	}

	List<Folder> list(UUID ownerId) {
		return folders.listLive(ownerId);
	}

	@Transactional
	Folder rename(UUID ownerId, UUID id, String name) {
		if (!folders.rename(ownerId, id, name)) {
			throw notFound();
		}
		return requireLive(ownerId, id);
	}

	// shortcut: two moves at the same moment could still form a cycle, lock the User's Folders if that ever matters.
	@Transactional
	Folder move(UUID ownerId, UUID id, UUID parentId) {
		var subtree = subtree(ownerId, id);
		if (parentId != null) {
			requireLive(ownerId, parentId);
			if (subtree.contains(parentId)) {
				throw new ApiException(HttpStatus.CONFLICT, "FOLDER_CYCLE",
						"A Folder cannot be moved into itself or one of its own subfolders.");
			}
		}
		folders.move(ownerId, id, parentId);
		return requireLive(ownerId, id);
	}

	Summary summary(UUID ownerId, UUID id) {
		var subtree = subtree(ownerId, id);
		return new Summary(subtree.size() - 1, folders.countLiveItems(ownerId, subtree));
	}

	@Transactional
	void delete(UUID ownerId, UUID id) {
		folders.trash(ownerId, subtree(ownerId, id), UUID.randomUUID(), clock.instant());
	}

	/** The Folder and all its live subfolders, at any depth; a 404 if the Folder is missing, deleted or not theirs. */
	public List<UUID> subtreeIds(UUID ownerId, UUID id) {
		return subtree(ownerId, id);
	}

	private List<UUID> subtree(UUID ownerId, UUID id) {
		var ids = folders.liveSubtreeIds(ownerId, id);
		if (ids.isEmpty()) {
			throw notFound();
		}
		return ids;
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Folder.");
	}

}
