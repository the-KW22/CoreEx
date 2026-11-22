package com.coreex.chat;

import java.time.Instant;
import java.util.UUID;

/**
 * A saved conversation. Its scope is fixed when it is made; only the general scope exists so far. useNotes is the Use my
 * Notes switch as the Chat remembers it.
 */
public record Chat(UUID id, String title, Instant createdAt, Instant lastUsedAt, boolean useNotes) {
}
