package com.coreex.chat;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import com.coreex.ai.Model;
import com.coreex.ai.Model.ContentBlock;
import com.coreex.items.Item;
import com.coreex.items.ItemService;

import tools.jackson.core.JsonToken;
import tools.jackson.databind.json.JsonMapper;

/**
 * The sources of a Chat's turns (ADR 0009, issue #382): the pieces quoted up front for the User's message, and the Items the
 * read tools returned in the turn. Nothing is parsed out of the model's text. They are worked out when the Chat is read, so
 * an Item removed since shows as removed, and only the User's own live Items are ever looked at.
 */
@Component
class ChatSources {

	/** An Item a turn used. removed is true when the Item is in the Trash or gone for good. */
	public record Source(UUID id, Item.Type type, String title, boolean removed) {
	}

	private record Ref(UUID id, Item.Type type, String title) {
	}

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final String SEARCH = "search";

	private final ItemService items;

	ChatSources(ItemService items) {
		this.items = items;
	}

	/** The sources of every turn, by the id of the last assistant message of that turn (the one that shows them). */
	Map<UUID, List<Source>> byLastAssistant(UUID owner, List<ChatMessage> messages) {
		var byMessage = new LinkedHashMap<UUID, List<Source>>();
		for (var turn : turns(messages)) {
			var last = turn.stream().filter(m -> m.role() == Model.Role.ASSISTANT).reduce((a, b) -> b);
			last.ifPresent(message -> byMessage.put(message.id(), sourcesOf(owner, turn)));
		}
		return byMessage;
	}

	/** The sources of the newest turn, for the reply's done event. */
	List<Source> ofNewestTurn(UUID owner, List<ChatMessage> messages) {
		var turns = turns(messages);
		return turns.isEmpty() ? List.of() : sourcesOf(owner, turns.getLast());
	}

	/** A turn starts with a User's own text and runs up to the next one; the tool results it sends back belong to it. */
	private static List<List<ChatMessage>> turns(List<ChatMessage> messages) {
		var turns = new ArrayList<List<ChatMessage>>();
		for (var message : messages) {
			if (message.role() == Model.Role.USER && message.blocks().stream().noneMatch(b -> b instanceof ContentBlock.ToolResult)) {
				turns.add(new ArrayList<>());
			}
			if (!turns.isEmpty()) {
				turns.getLast().add(message);
			}
		}
		return turns;
	}

	private List<Source> sourcesOf(UUID owner, List<ChatMessage> turn) {
		var toolNames = new HashMap<String, String>();
		for (var message : turn) {
			for (var block : message.blocks()) {
				if (block instanceof ContentBlock.ToolUse use) {
					toolNames.put(use.id(), use.name());
				}
			}
		}
		var refs = new LinkedHashMap<UUID, Ref>();
		for (var message : turn) {
			for (var quote : message.quotes()) {
				refs.putIfAbsent(quote.id(), new Ref(quote.id(), quote.type(), quote.title()));
			}
			for (var block : message.blocks()) {
				if (block instanceof ContentBlock.ToolResult result && !result.isError() && toolNames.containsKey(result.toolUseId())) {
					for (var ref : readRefs(toolNames.get(result.toolUseId()), result.content())) {
						refs.putIfAbsent(ref.id(), ref);
					}
				}
			}
		}
		if (refs.isEmpty()) {
			return List.of();
		}
		var live = items.findLive(owner, List.copyOf(refs.keySet())).stream()
				.collect(Collectors.toMap(Item::id, Function.identity()));
		return refs.values().stream().map(ref -> {
			var now = live.get(ref.id());
			return new Source(ref.id(), ref.type(), now == null ? ref.title() : now.title(), now == null);
		}).toList();
	}

	/** The Items one read tool's result names. A tool that reads no whole Item (lists, the graph) names none. */
	private static List<Ref> readRefs(String tool, String content) {
		return switch (tool) {
			case SEARCH -> searchRefs(content);
			case "get_item" -> head(content, null);
			case "get_application" -> head(content, Item.Type.APPLICATION);
			case "get_resume" -> head(content, Item.Type.RESUME);
			case "get_cover_letter" -> head(content, Item.Type.COVER_LETTER);
			default -> List.of();
		};
	}

	/**
	 * The pieces a search found. shortcut: a search result cut at the tool-result cap gives no sources, because its JSON is
	 * no longer whole; upgrade to reading it as a stream if the cap ever holds fewer than the search's eight pieces.
	 */
	private static List<Ref> searchRefs(String content) {
		try {
			var refs = new ArrayList<Ref>();
			for (var chunk : JSON.readTree(content).path("chunks")) {
				refs.add(new Ref(UUID.fromString(chunk.path("id").asString()), Item.Type.valueOf(chunk.path("type").asString()),
						chunk.path("title").asString()));
			}
			return refs;
		}
		catch (RuntimeException e) {
			return List.of();
		}
	}

	/**
	 * The id, title and (unless the tool fixes it) type of a whole Item, read from the head of its JSON only, which comes
	 * first in every result: a result cut at the cap still names its Item.
	 */
	private static List<Ref> head(String content, Item.Type fixedType) {
		String id = null;
		String title = null;
		String kind = null;
		try (var parser = JSON.createParser(content)) {
			if (parser.nextToken() != JsonToken.START_OBJECT) {
				return List.of();
			}
			while (parser.nextToken() == JsonToken.PROPERTY_NAME) {
				var name = parser.currentName();
				var value = parser.nextToken();
				if (value == JsonToken.VALUE_STRING) {
					switch (name) {
						case "id" -> id = parser.getString();
						case "title" -> title = parser.getString();
						case "type" -> kind = parser.getString();
						default -> {
						}
					}
				}
				else if (value == JsonToken.START_OBJECT || value == JsonToken.START_ARRAY) {
					parser.skipChildren();
				}
				if (id != null && title != null && (fixedType != null || kind != null)) {
					break;
				}
			}
		}
		catch (RuntimeException e) {
			// A cut result: what was read before the cut is kept.
		}
		var type = fixedType;
		if (type == null && kind != null) {
			type = Item.Type.valueOf(kind);
		}
		if (id == null || title == null || type == null) {
			return List.of();
		}
		return List.of(new Ref(UUID.fromString(id), type, title));
	}

}
