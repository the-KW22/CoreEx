package com.coreex.items;

import java.time.Instant;
import java.util.UUID;

/** What the Item list shows; a Note's or Asset's own content lives in its feature. A null folder is the top level. */
public record Item(UUID id, Type type, String title, UUID folderId, Instant updatedAt) {

	public enum Type {
		NOTE, ASSET
	}

}
