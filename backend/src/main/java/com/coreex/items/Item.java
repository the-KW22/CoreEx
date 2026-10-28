package com.coreex.items;

import java.time.Instant;
import java.util.UUID;

/** What the Item list shows; a Note's or Asset's own content lives in its feature. */
record Item(UUID id, Type type, String title, Instant updatedAt) {

	enum Type {
		NOTE, ASSET
	}

}
