package com.coreex.notes;

import java.time.Clock;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;
import com.coreex.folders.FolderService;
import com.coreex.links.LinkService;

@Service
public class NoteService {

	private final NoteRepository notes;

	private final FolderService folders;

	private final LinkService links;

	private final Clock clock;

	NoteService(NoteRepository notes, FolderService folders, LinkService links, Clock clock) {
		this.notes = notes;
		this.folders = folders;
		this.links = links;
		this.clock = clock;
	}

	@Transactional
	Note create(UUID ownerId, UUID folderId, String title, String body) {
		if (folderId != null) {
			folders.requireLiveForWrite(ownerId, folderId);
		}
		var text = links.rewriteTitles(ownerId, body == null ? "" : body);
		var id = notes.insert(ownerId, folderId, title == null ? "" : title, text);
		links.reindex(id, text);
		return get(ownerId, id);
	}

	public Note get(UUID ownerId, UUID id) {
		return notes.find(ownerId, id).orElseThrow(NoteService::notFound);
	}

	@Transactional
	Note save(UUID ownerId, UUID id, String title, String body, int seenVersion) {
		// Hand-typed [[Exact Title]] becomes [[id|Exact Title]] here, so the stored text is the rewritten one.
		var text = links.rewriteTitles(ownerId, body);
		if (!notes.save(ownerId, id, title, text, seenVersion)) {
			// Missing (or someone else's) is 404; otherwise the Note moved on since the caller read it.
			get(ownerId, id);
			throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
					"This Note was changed somewhere else since you opened it.");
		}
		links.reindex(id, text);
		return get(ownerId, id);
	}

	void delete(UUID ownerId, UUID id) {
		if (!notes.softDelete(ownerId, id, clock.instant())) {
			throw notFound();
		}
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Note.");
	}

}
