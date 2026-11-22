package com.coreex.chat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.coreex.ai.Model;

/**
 * One stored message: a User's text, a model step, or the tool results sent back to the model. A User's text carries the
 * pieces Semantic search quoted for it (empty when none).
 */
public record ChatMessage(UUID id, Model.Role role, List<Model.ContentBlock> blocks, String status, String errorCode,
		List<Quote> quotes, Instant createdAt) {
}
