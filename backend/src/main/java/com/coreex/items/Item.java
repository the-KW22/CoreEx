package com.coreex.items;

import java.time.Instant;
import java.util.UUID;

/**
 * What the Item list shows; a Note's or Asset's own content lives in its feature. A null folder is the top level. The snippet
 * is a Note's text preview, set only by the list query and null otherwise.
 */
public record Item(UUID id, Type type, String title, UUID folderId, Instant updatedAt, String snippet) {

	public enum Type {
		NOTE, ASSET
	}

}
