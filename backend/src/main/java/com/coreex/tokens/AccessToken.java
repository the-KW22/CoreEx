package com.coreex.tokens;

import java.time.Instant;
import java.util.UUID;

/** Lets an Agent act for one User on /mcp (see CONTEXT.md). Only a hash of the secret is stored. */
record AccessToken(UUID id, UUID ownerId, String name, Instant createdAt, Instant lastUsedAt, Instant expiresAt) {
}
