package com.coreex.chat;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Where the User is when they send a message (issue #200). It goes into that one reply's system prompt and is never
 * stored. Too long is refused by validation, never cut.
 */
@Schema(nullable = true, description = "Where the User is in CoreEx when they send this message. It shapes this reply only and is never stored.")
record ChatContext(
		@Valid @Schema(nullable = true, description = "The Note or Asset the User has open") OpenItem open,
		@Size(max = 2000) @Schema(nullable = true, description = "Text the User selected in the Note editor") String selection,
		@Valid @Size(max = 20) @Schema(nullable = true, description = "The User's recent actions, oldest first")
		List<@NotNull @Valid TrailStep> trail) {

	/** True when the User has sent nothing about where they are, so the reply keeps the plain prompt. */
	boolean isEmpty() {
		return open == null && (selection == null || selection.isBlank()) && (trail == null || trail.isEmpty());
	}

	enum OpenKind {
		NOTE, ASSET
	}

	enum TrailKind {
		NOTE, ASSET, FOLDER, TAG, SEARCH
	}

	enum Action {
		OPENED, CREATED, EDITED, MOVED, TRASHED, SEARCHED
	}

	record OpenItem(@NotNull OpenKind kind, @NotNull UUID id,
			@Size(max = 300) @Schema(nullable = true, description = "The Item's title") String title) {
	}

	record TrailStep(@NotNull Action action, @Schema(nullable = true) TrailKind kind,
			@Schema(nullable = true, description = "The Item's id, absent for a search") UUID id,
			@Size(max = 300) @Schema(nullable = true, description = "The Item's title, or the search words for SEARCHED")
			String title) {
	}

}
