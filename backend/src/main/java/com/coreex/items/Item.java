package com.coreex.items;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.coreex.tags.Tag;

/**
 * What the Item list shows; a Note's or Asset's own content lives in its feature. A null folder is the top level. The
 * snippet (a Note's text preview), the size in bytes (an Asset's file, or a Note's text) and the Tags are set only for
 * the list; elsewhere they are null, null and empty.
 */
public record Item(UUID id, Type type, String title, UUID folderId, Instant updatedAt, String snippet, Long sizeBytes,
		List<Tag> tags) {

	Item withTags(List<Tag> tags) {
		return new Item(id, type, title, folderId, updatedAt, snippet, sizeBytes, tags);
	}


	public enum Type {
		NOTE, ASSET
	}

}
