package com.coreex.notes;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;
import com.coreex.folders.FolderService;
import com.coreex.links.LinkService;
import com.coreex.notes.NoteVersionRepository.NoteVersion;

@Service
public class NoteService {

	private final NoteRepository notes;

	private final NoteVersionRepository versions;

	private final FolderService folders;

	private final LinkService links;

	private final Clock clock;

	NoteService(NoteRepository notes, NoteVersionRepository versions, FolderService folders, LinkService links,
			Clock clock) {
		this.notes = notes;
		this.versions = versions;
		this.folders = folders;
		this.links = links;
		this.clock = clock;
	}

	@Transactional
	public Note create(UUID ownerId, UUID folderId, String title, String body) {
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

	/** A User's save: the text it replaces is kept as a version, except when the last one is close behind it. */
	@Transactional
	public Note save(UUID ownerId, UUID id, String title, String body, int seenVersion) {
		return save(ownerId, id, title, body, seenVersion, false);
	}

	/** With {@code keepOld}, the text this save replaces is always kept as a version (an Agent's edit, a restore). */
	@Transactional
	public Note save(UUID ownerId, UUID id, String title, String body, int seenVersion, boolean keepOld) {
		// Hand-typed [[Exact Title]] becomes [[id|Exact Title]] here, so the stored text is the rewritten one.
		var text = links.rewriteTitles(ownerId, body);
		// Kept before the save, in the same transaction, so a refused save keeps nothing.
		if (versions.keep(ownerId, id, seenVersion, keepOld)) {
			versions.prune(ownerId, id);
		}
		if (!notes.save(ownerId, id, title, text, seenVersion)) {
			// Missing (or someone else's) is 404; otherwise the Note moved on since the caller read it.
			get(ownerId, id);
			throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
					"This Note was changed somewhere else since you opened it.");
		}
		links.reindex(id, text);
		return get(ownerId, id);
	}

	// shortcut: not paged, a Note keeps at most coreex.notes.versions.keep (50) versions, page it if that grows.
	public List<NoteVersion> versions(UUID ownerId, UUID id) {
		get(ownerId, id);
		return versions.list(ownerId, id);
	}

	public NoteVersion version(UUID ownerId, UUID id, UUID versionId) {
		return versions.find(ownerId, id, versionId).orElseThrow(NoteService::versionNotFound);
	}

	/** Saves an earlier text as the Note's text. The text it replaces is kept, so a restore can be undone. */
	@Transactional
	public Note restore(UUID ownerId, UUID id, UUID versionId, int seenVersion) {
		var old = version(ownerId, id, versionId);
		return save(ownerId, id, old.title(), old.body(), seenVersion, true);
	}

	public void delete(UUID ownerId, UUID id) {
		if (!notes.softDelete(ownerId, id, clock.instant())) {
			throw notFound();
		}
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Note.");
	}

	private static ApiException versionNotFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such version of the Note.");
	}

}
