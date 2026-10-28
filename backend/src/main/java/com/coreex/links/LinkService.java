package com.coreex.links;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;

import com.coreex.folders.FolderService;
import com.coreex.items.Item;
import com.coreex.items.ItemService;

/**
 * Turns a Note's Markdown into the Link index and resolves Links. Every lookup is scoped to the User and to live
 * Items, so a Link can never resolve to another User's Item or to one in the Trash.
 */
@Service
public class LinkService {

	/** A live Item a Link can point at, with its current title and where it sits. */
	public record Target(UUID id, Item.Type type, String title, String folderPath) {
	}

	public record Backlink(UUID id, String title) {
	}

	// shortcut: only the 100 most recently updated Backlinks are listed, add paging if an Item is linked from more.
	private static final int MAX_BACKLINKS = 100;

	private static final int MAX_SUGGESTIONS = 10;

	// shortcut: only the first 100 distinct hand-typed titles are resolved per save, the rest stay as written;
	// raise it (or batch the lookup) if a real Note needs more.
	private static final int MAX_TITLES_PER_SAVE = 100;

	// shortcut: only the first 200 distinct Link targets of a Note are indexed, raise it if a real Note needs more.
	private static final int MAX_TARGETS_PER_NOTE = 200;

	private final LinkRepository links;

	private final ItemService items;

	private final FolderService folders;

	LinkService(LinkRepository links, ItemService items, FolderService folders) {
		this.links = links;
		this.items = items;
		this.folders = folders;
	}

	/**
	 * Rewrites each hand-typed {@code [[Exact Title]]} into {@code [[id|Exact Title]]} when exactly one live Item of
	 * the User has that exact title. Anything else (no match, several, trashed, someone else's) stays as written.
	 */
	public String rewriteTitles(UUID ownerId, String markdown) {
		var resolved = new HashMap<String, Optional<UUID>>();
		var out = new StringBuilder();
		var copied = 0;
		for (var link : LinkParser.parse(markdown)) {
			if (link.id() != null) {
				continue;
			}
			var id = resolved.get(link.text());
			if (id == null) {
				id = resolved.size() < MAX_TITLES_PER_SAVE ? items.soleLiveIdWithTitle(ownerId, link.text())
						: Optional.empty();
				resolved.put(link.text(), id);
			}
			if (id.isPresent()) {
				out.append(markdown, copied, link.start()).append("[[").append(id.get()).append('|')
						.append(link.text()).append("]]");
				copied = link.end();
			}
		}
		return copied == 0 ? markdown : out.append(markdown, copied, markdown.length()).toString();
	}

	/** Rebuilds the Note's rows in the Link index from its (already rewritten) Markdown. */
	public void reindex(UUID sourceId, String markdown) {
		var targets = new LinkedHashMap<UUID, String>();
		for (var link : LinkParser.parse(markdown)) {
			if (link.id() != null && targets.size() < MAX_TARGETS_PER_NOTE) {
				targets.putIfAbsent(link.id(), link.text().length() > 200 ? link.text().substring(0, 200) : link.text());
			}
		}
		links.replace(sourceId, targets);
	}

	/** The live Notes that link to this Item (a 404 if the Item is missing, trashed or not the User's). */
	public List<Backlink> backlinks(UUID ownerId, UUID itemId) {
		items.requireLive(ownerId, itemId);
		return links.backlinks(ownerId, itemId, MAX_BACKLINKS).stream().map(b -> new Backlink(b.id(), b.title()))
				.toList();
	}

	/** Current title, type and Folder path of the ids that are live Items of the User; the rest are left out. */
	public List<Target> resolve(UUID ownerId, List<UUID> ids) {
		return withPaths(ownerId, items.findLive(ownerId, ids));
	}

	/** Live Items for the autocomplete: titles containing the text, the ones starting with it first. */
	public List<Target> suggest(UUID ownerId, String text) {
		return withPaths(ownerId, items.suggest(ownerId, text, MAX_SUGGESTIONS));
	}

	private List<Target> withPaths(UUID ownerId, List<Item> found) {
		if (found.isEmpty()) {
			return List.of();
		}
		var paths = folders.paths(ownerId);
		return found.stream().map(i -> new Target(i.id(), i.type(), i.title(), paths.get(i.folderId()))).toList();
	}

}
