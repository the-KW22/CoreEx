package com.coreex.resumes;

import java.time.Instant;
import java.util.UUID;

/** A Resume with its document; a null folder is the top level. */
public record Resume(UUID id, String title, ResumeDocument document, int version, UUID folderId, Instant createdAt,
		Instant updatedAt) {
}
