package com.coreex.applications;

import java.time.Instant;
import java.util.UUID;

/** A PDF sent for an Application: an Asset attached with a label. */
public record ApplicationDocument(UUID assetId, String title, Label label, long sizeBytes, Instant attachedAt) {

	/** What the PDF is. */
	public enum Label {
		RESUME, COVER_LETTER, OTHER
	}

}
