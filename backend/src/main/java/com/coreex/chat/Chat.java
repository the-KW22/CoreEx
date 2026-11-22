package com.coreex.chat;

import java.time.Instant;
import java.util.UUID;

/** A saved conversation. Its scope is fixed when it is made; only the general scope exists so far. */
public record Chat(UUID id, String title, Instant createdAt, Instant lastUsedAt) {
}
