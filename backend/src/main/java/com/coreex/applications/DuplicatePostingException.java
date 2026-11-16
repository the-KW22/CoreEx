package com.coreex.applications;

import java.util.UUID;

import org.springframework.http.HttpStatus;

import com.coreex.common.ApiException;

/** The posting is already tracked: says which Application holds it, so the caller can point to it. */
class DuplicatePostingException extends ApiException {

	private final UUID existingId;

	private final String existingTitle;

	DuplicatePostingException(UUID existingId, String existingTitle) {
		super(HttpStatus.CONFLICT, "DUPLICATE_POSTING",
				"That posting is already tracked as \"" + existingTitle + "\" (id " + existingId + ").");
		this.existingId = existingId;
		this.existingTitle = existingTitle;
	}

	UUID existingId() {
		return existingId;
	}

	String existingTitle() {
		return existingTitle;
	}

}
