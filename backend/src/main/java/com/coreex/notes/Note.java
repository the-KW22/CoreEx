package com.coreex.notes;

import java.time.Instant;
import java.util.UUID;

/** A Note with its Markdown exactly as written. The version counts saves; a null folder is the top level. */
public record Note(UUID id, String title, String body, int version, UUID folderId, Instant createdAt, Instant updatedAt,
		String editedBy) {
}
