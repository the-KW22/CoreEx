package com.coreex.search;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.embeddings.Embedder;
import com.coreex.folders.FolderService;
import com.coreex.items.Item;
import com.coreex.tags.TagService;

/**
 * Search over the User's live Items: exact words and, for Notes, meaning, merged into one list; and the quick
 * switcher's title lookup.
 */
@Service
public class SearchService {

	public record Segment(String text, boolean match) {
	}

	public record Hit(UUID id, Item.Type type, String title, String folderPath, Instant updatedAt,
			List<Segment> snippet) {
	}

	/** {@code exactOnly}: the search by meaning was wanted but could not run, so only exact words were used. */
	public record Page(List<Hit> hits, long total, boolean exactOnly) {
	}

	public record NoteText(UUID id, String title, int version, String body) {
	}

	/** Two Notes close in meaning, 0 to 1. Asked from one side, so the same pair can come back from the other. */
	public record SimilarNotes(UUID source, UUID target, double similarity) {
	}

	record QuickHit(UUID id, Item.Type type, String title, String folderPath) {
	}

	private static final char START = 2;

	private static final char STOP = 3;

	private static final int QUICK_LIMIT = 10;

	private static final int RECENT_LIMIT = 8;

	/** How many of the best matches of each kind are merged. */
	// shortcut: only the best 100 exact matches and 100 matches by meaning are merged, so with more than 100 exact
	// matches the pages end sooner than the exact count says; raise it, or merge in the database, if that matters.
	private static final int WINDOW = 100;

	/** How many of the closest Chunks are looked at; several can belong to one Note. */
	private static final int NEAREST_CHUNKS = 200;

	/** The same for a Suggested Link, per Note: several Chunks of one close Note must still leave room for others. */
	private static final int SIMILAR_CHUNKS = 20;

	/** Reciprocal Rank Fusion's usual constant: a larger one flattens the difference between ranks. */
	private static final int RRF_K = 60;

	private static final int EXCERPT = 200;

	private final SearchRepository search;

	private final FolderService folders;

	private final TagService tags;

	private final Embedder embedder;

	private final SearchProperties properties;

	SearchService(SearchRepository search, FolderService folders, TagService tags, Embedder embedder,
			SearchProperties properties) {
		this.search = search;
		this.folders = folders;
		this.tags = tags;
		this.embedder = embedder;
		this.properties = properties;
	}

	/** The closest few of these Notes to each of them, above the line. Empty until Notes have been embedded. */
	public List<SimilarNotes> similarNotes(UUID ownerId, List<UUID> noteIds, int perNote) {
		if (noteIds.isEmpty()) {
			return List.of();
		}
		return search.similarNotes(ownerId, noteIds, perNote, SIMILAR_CHUNKS, 1 - properties.minSimilarNotes()).stream()
				.map(s -> new SimilarNotes(s.source(), s.target(), 1 - s.distance())).toList();
	}

	/** Live Notes of the User with this phrase as words, for unlinked mentions: not this Item, none that link to it. */
	public List<NoteText> notesWithPhrase(UUID ownerId, UUID itemId, String phrase, int limit) {
		return search.notesWithPhrase(ownerId, itemId, phrase, limit).stream()
				.map(n -> new NoteText(n.id(), n.title(), n.version(), n.body())).toList();
	}

	/**
	 * An unknown Folder or Tag is a 404 (a Folder includes its subfolders); a blank query finds nothing. Notes are
	 * found by words and by meaning and the two lists are merged; when the query cannot be embedded, or nothing is
	 * close enough, the answer is the list of exact matches.
	 */
	public Page search(UUID ownerId, String text, Item.Type type, UUID tagId, UUID folderId, int page, int size) {
		var folderIds = folderId == null ? null : folders.subtreeIds(ownerId, folderId);
		if (tagId != null) {
			tags.requireTag(ownerId, tagId);
		}
		if (text.isBlank()) {
			return new Page(List.of(), 0, false);
		}
		var paths = folders.paths(ownerId);
		var asksForNotes = type != Item.Type.ASSET; // only Notes have Chunks
		var byMeaning = asksForNotes ? nearest(ownerId, text, type, tagId, folderIds) : Optional.<List<SearchRepository.Near>>empty();
		if (byMeaning.isEmpty() || byMeaning.get().isEmpty()) {
			var hits = search.search(ownerId, text, type, tagId, folderIds, size, (long) page * size).stream()
					.map(h -> hit(h, paths)).toList();
			return new Page(hits, search.count(ownerId, text, type, tagId, folderIds), asksForNotes && byMeaning.isEmpty());
		}
		return merged(ownerId, text, type, tagId, folderIds, page, size, byMeaning.get(), paths);
	}

	/** Empty when the query could not be embedded. */
	private Optional<List<SearchRepository.Near>> nearest(UUID ownerId, String text, Item.Type type, UUID tagId,
			List<UUID> folderIds) {
		return embedder.embed(List.of(text)).map(vectors -> search.nearest(ownerId, Embedder.literal(vectors.get(0)),
				type, tagId, folderIds, 1 - properties.minSimilarity(), NEAREST_CHUNKS, WINDOW));
	}

	private Page merged(UUID ownerId, String text, Item.Type type, UUID tagId, List<UUID> folderIds, int page,
			int size, List<SearchRepository.Near> near, Map<UUID, String> paths) {
		var exactIds = search.rankedIds(ownerId, text, type, tagId, folderIds, WINDOW);
		var order = fuse(exactIds, near.stream().map(SearchRepository.Near::id).toList());
		var from = (int) Math.min(order.size(), (long) page * size);
		var pageIds = order.subList(from, Math.min(order.size(), from + size));
		// Exact matches keep their highlighted snippet; the snippet is only worked out for the Items on this page.
		var exactSet = new HashSet<>(exactIds);
		var onPage = pageIds.stream().filter(exactSet::contains).toList();
		var exact = onPage.isEmpty() ? Map.<UUID, SearchRepository.Hit>of()
				: search.search(ownerId, text, type, tagId, folderIds, onPage.size(), 0, onPage).stream()
						.collect(Collectors.toMap(SearchRepository.Hit::id, Function.identity()));
		var nearById = near.stream().collect(Collectors.toMap(SearchRepository.Near::id, Function.identity()));
		var hits = new ArrayList<Hit>();
		for (var id : pageIds) {
			if (exact.containsKey(id)) {
				hits.add(hit(exact.get(id), paths));
			}
			else if (nearById.containsKey(id)) {
				var n = nearById.get(id);
				hits.add(new Hit(n.id(), n.type(), n.title(), paths.get(n.folderId()), n.updatedAt(),
						List.of(new Segment(excerpt(n.content()), false))));
			}
		}
		return new Page(hits, order.size(), false);
	}

	private static Hit hit(SearchRepository.Hit h, Map<UUID, String> paths) {
		return new Hit(h.id(), h.type(), h.title(), paths.get(h.folderId()), h.updatedAt(), segments(h.headline()));
	}

	/**
	 * Reciprocal Rank Fusion: each list gives an item {@code 1 / (60 + rank)}, and the scores add up, so an item in
	 * both lists rises. Only ranks count, never the scores of either search, which cannot be compared. A tie keeps
	 * the first list's order.
	 */
	static List<UUID> fuse(List<UUID> first, List<UUID> second) {
		var scores = new LinkedHashMap<UUID, Double>();
		for (var list : List.of(first, second)) {
			var seen = new HashSet<UUID>();
			for (var id : list) {
				if (seen.add(id)) {
					scores.merge(id, 1.0 / (RRF_K + seen.size()), Double::sum);
				}
			}
		}
		return scores.entrySet().stream().sorted(Map.Entry.<UUID, Double>comparingByValue().reversed())
				.map(Map.Entry::getKey).toList();
	}

	/** A Chunk's text without its first line (the title and heading path), cut to about 200 characters at a word end. */
	static String excerpt(String chunk) {
		var cut = chunk.indexOf("\n\n");
		var text = (cut >= 0 ? chunk.substring(cut + 2) : chunk).replaceAll("\\s+", " ").strip();
		if (text.length() <= EXCERPT) {
			return text;
		}
		var end = text.lastIndexOf(' ', EXCERPT);
		return text.substring(0, end > EXCERPT / 2 ? end : EXCERPT) + "…";
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
