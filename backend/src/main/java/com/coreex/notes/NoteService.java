package com.coreex.notes;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;

@Service
class NoteService {

	private final NoteRepository notes;

	NoteService(NoteRepository notes) {
		this.notes = notes;
	}

	@Transactional
	Note create(UUID ownerId, String title, String body) {
		return get(ownerId, notes.insert(ownerId, title == null ? "" : title, body == null ? "" : body));
	}

	Note get(UUID ownerId, UUID id) {
		return notes.find(ownerId, id).orElseThrow(NoteService::notFound);
	}

	@Transactional
	Note save(UUID ownerId, UUID id, String title, String body, int seenVersion) {
		if (!notes.save(ownerId, id, title, body, seenVersion)) {
			// Missing (or someone else's) is 404; otherwise the Note moved on since the caller read it.
			get(ownerId, id);
			throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
					"This Note was changed somewhere else since you opened it.");
		}
		return get(ownerId, id);
	}

	void delete(UUID ownerId, UUID id) {
		if (!notes.softDelete(ownerId, id)) {
			throw notFound();
		}
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Note.");
	}

}
