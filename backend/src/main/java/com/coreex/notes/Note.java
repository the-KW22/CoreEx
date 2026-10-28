package com.coreex.notes;

import java.time.Instant;
import java.util.UUID;

/** A Note with its Markdown exactly as written. The version counts saves. */
record Note(UUID id, String title, String body, int version, Instant createdAt, Instant updatedAt) {
}
