package com.coreex.assets;

import java.time.Instant;
import java.util.UUID;

/** An uploaded file kept as an Item. The storage key says where its bytes are; it is never shown to clients. */
record Asset(UUID id, String title, String description, String mimeType, long sizeBytes, UUID folderId,
		String storageKey, Instant updatedAt) {
}
