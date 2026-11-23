package com.coreex.chat;

import java.time.Instant;
import java.util.UUID;

/**
 * A saved conversation. Its scope is fixed when it is made: general, career (the User's Knowledge and Career results), or
 * one Application. useNotes, useApplications and useKnowledge are the switches as the Chat remembers them.
 */
public record Chat(UUID id, String title, Instant createdAt, Instant lastUsedAt, boolean useNotes, Scope scope,
		UUID applicationId, boolean useApplications, boolean useKnowledge) {

	public enum Scope {
		GENERAL, CAREER, APPLICATION
	}

}
