package com.coreex.chat;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * A change the model offered in a Chat. PENDING waits for the User; APPLIED, REJECTED and REPLACED (a newer Proposal for
 * the same Note took its place) are the answers, each given once. before and after are a Note's text then and as it would
 * be, null for tools that do not write a Note's text.
 */
record Proposal(UUID id, UUID chatId, UUID messageId, UUID batchId, String toolUseId, String tool, String label,
		Map<String, Object> input, UUID targetId, String before, String after, String status, String result,
		String changeSubject, String changeBefore, String changeAfter, Instant createdAt) {

	static final String PENDING = "PENDING";

	static final String APPLIED = "APPLIED";

	static final String REJECTED = "REJECTED";

	static final String REPLACED = "REPLACED";

}
