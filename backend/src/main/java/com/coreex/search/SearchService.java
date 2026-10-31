package com.coreex.search;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.folders.FolderService;
import com.coreex.items.Item;
import com.coreex.tags.TagService;

/** Full-text search over the User's live Items, and the quick switcher's title lookup. */
@Service
public class SearchService {

	public record Segment(String text, boolean match) {
	}

	public record Hit(UUID id, Item.Type type, String title, String folderPath, Instant updatedAt,
			List<Segment> snippet) {
	}

	public record Page(List<Hit> hits, long total) {
	}

	record QuickHit(UUID id, Item.Type type, String title, String folderPath) {
	}

	private static final char START = 2;

	private static final char STOP = 3;

	private static final int QUICK_LIMIT = 10;

	private static final int RECENT_LIMIT = 8;

	private final SearchRepository search;

	private final FolderService folders;

	private final TagService tags;

	SearchService(SearchRepository search, FolderService folders, TagService tags) {
		this.search = search;
		this.folders = folders;
		this.tags = tags;
	}

	/** An unknown Folder or Tag is a 404 (a Folder includes its subfolders); a blank query finds nothing. */
	public Page search(UUID ownerId, String text, Item.Type type, UUID tagId, UUID folderId, int page, int size) {
		var folderIds = folderId == null ? null : folders.subtreeIds(ownerId, folderId);
		if (tagId != null) {
			tags.requireTag(ownerId, tagId);
		}
		if (text.isBlank()) {
			return new Page(List.of(), 0);
		}
		var paths = folders.paths(ownerId);
		var hits = search.search(ownerId, text, type, tagId, folderIds, size, (long) page * size).stream()
				.map(h -> new Hit(h.id(), h.type(), h.title(), paths.get(h.folderId()), h.updatedAt(),
						segments(h.headline())))
				.toList();
		return new Page(hits, search.count(ownerId, text, type, tagId, folderIds));
	}

	/** Titles close to the text; with nothing typed, the Items opened most recently (else updated most recently). */
	@Transactional(readOnly = true)
	List<QuickHit> quick(UUID ownerId, String text) {
		List<SearchRepository.Quick> found;
		if (text.isBlank()) {
			found = search.recentlyOpened(ownerId, RECENT_LIMIT);
			if (found.isEmpty()) {
				found = search.recentlyUpdated(ownerId, RECENT_LIMIT);
			}
		}
		else {
			found = search.quick(ownerId, text.trim(), QUICK_LIMIT);
		}
		if (found.isEmpty()) {
			return List.of();
		}
		var paths = folders.paths(ownerId);
		return found.stream().map(q -> new QuickHit(q.id(), q.type(), q.title(), paths.get(q.folderId()))).toList();
	}

	/** Splits a headline at the two marker characters into plain text and matched text. No markup is involved. */
	static List<Segment> segments(String headline) {
		var out = new ArrayList<Segment>();
		if (headline == null) {
			return out;
		}
		var text = new StringBuilder();
		var matching = false;
		for (var c : headline.toCharArray()) {
			if (c == START || c == STOP) {
				if (!text.isEmpty()) {
					out.add(new Segment(text.toString(), matching));
					text.setLength(0);
				}
				matching = c == START;
			}
			else {
				text.append(c);
			}
		}
		if (!text.isEmpty()) {
			out.add(new Segment(text.toString(), matching));
		}
		return out;
	}

}
