package com.coreex.notes;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.common.ApiException;
import com.coreex.items.Item;
import com.coreex.items.ItemService;
import com.coreex.search.SearchService;

/** Notes that mention an Item's title without linking to it, and turning one mention into a Link. */
@Service
class MentionService {

	record Mention(UUID id, String title, int version, String before, String match, String after) {
	}

	record Page(List<Mention> items, int total) {
	}

	private static final int AROUND = 60;

	// shortcut: only the 200 most recently updated Notes with the title are looked at, so the count stops there; raise it
	// or check the mention in SQL if a title really is in more.
	private static final int CANDIDATES = 200;

	private final SearchService search;

	private final NoteService notes;

	private final ItemService items;

	MentionService(SearchService search, NoteService notes, ItemService items) {
		this.search = search;
		this.notes = notes;
		this.items = items;
	}

	/** The first {@code size} mentions, most recently updated Notes first. A 404 for a missing, trashed or foreign Item. */
	Page list(UUID ownerId, UUID itemId, int size) {
		var title = target(ownerId, itemId).title();
		if (title.length() < Mentions.MIN_TITLE) {
			return new Page(List.of(), 0);
		}
		var found = search.notesWithPhrase(ownerId, itemId, title, CANDIDATES).stream()
				.filter(n -> Mentions.first(n.body(), title) >= 0).toList();
		return new Page(found.stream().limit(size).map(n -> mention(n, title)).toList(), found.size());
	}

	/**
	 * Wraps the first mention as a Link, keeping the words as written, through the normal version-checked save. A 409 when
	 * the Note moved on since {@code seenVersion}; a 404 when it no longer has a mention.
	 */
	void link(UUID ownerId, UUID itemId, UUID noteId, int seenVersion) {
		var title = target(ownerId, itemId).title();
		var note = notes.get(ownerId, noteId);
		var body = note.body();
		var at = itemId.equals(noteId) ? -1 : Mentions.first(body, title);
		if (at < 0 && note.version() == seenVersion) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "That Note no longer mentions this Item.");
		}
		// A stale version fails in save, whatever this copy of the text says.
		var linked = at < 0 ? body
				: body.substring(0, at) + "[[" + itemId + "|" + body.substring(at, at + title.length()) + "]]"
						+ body.substring(at + title.length());
		notes.save(ownerId, noteId, note.title(), linked, seenVersion);
	}

	private Item target(UUID ownerId, UUID itemId) {
		return items.findLive(ownerId, List.of(itemId)).stream().findFirst().orElseThrow(
				() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Item."));
	}

	private static Mention mention(SearchService.NoteText note, String title) {
		var body = note.body();
		var at = Mentions.first(body, title);
		var end = at + title.length();
		var before = body.substring(Math.max(0, at - AROUND), at).stripLeading().replaceAll("\\s+", " ");
		var after = body.substring(end, Math.min(body.length(), end + AROUND)).stripTrailing().replaceAll("\\s+", " ");
		return new Mention(note.id(), note.title(), note.version(), (at > AROUND ? "…" : "") + before,
				body.substring(at, end), after + (end + AROUND < body.length() ? "…" : ""));
	}

}
