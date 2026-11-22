package com.coreex.chat;

import java.util.UUID;

import com.coreex.items.Item;

/**
 * A piece of an Item that Semantic search found for a User's message, sent to the model up front and stored with the
 * message. The text is kept as it was quoted, so the Chat still holds it after the Note changes or goes.
 */
record Quote(UUID id, Item.Type type, String title, String headingPath, String text) {
}
