package com.coreex.invites;

import java.time.Instant;
import java.util.UUID;

/** Permission for one email address to create a CoreEx account (see CONTEXT.md). */
record Invite(UUID id, String email, Status status, Instant createdAt, Instant acceptedAt) {

	enum Status {
		PENDING, ACCEPTED, REVOKED
	}

}
