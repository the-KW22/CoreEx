package com.coreex.links;

import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

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

	/** x and y are where the User left the node in this graph (its Graph layout), null when never placed. */
	public record GraphNode(UUID id, Item.Type type, String title, String folderPath, int linkCount, boolean stub,
			Double x, Double y) {
	}

	public record GraphEdge(UUID source, UUID target) {
	}

	/** {@code total} counts every node before the cap; {@code truncated} says the cap cut some. */
	public record Graph(List<GraphNode> nodes, List<GraphEdge> edges, int total, boolean truncated) {
	}

	// shortcut: a graph keeps only its 500 most-linked nodes so the browser stays fast; page or cluster it if Users
	// need to see bigger Folders whole.
	static final int MAX_GRAPH_NODES = 500;

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

	/**
	 * The Items in a Folder and its subfolders (or all of the User's when folderId is null) and the Links between
	 * them. Outside Items linked to or from them come back as stubs. A 404 for a missing or foreign Folder.
	 */
	public Graph graph(UUID ownerId, UUID folderId) {
		var folderIds = folderId == null ? null : folders.subtreeIds(ownerId, folderId);
		var edges = links.graphEdges(ownerId, folderIds);
		var linkCount = new HashMap<UUID, Integer>();
		for (var edge : edges) {
			linkCount.merge(edge.source(), 1, Integer::sum);
			linkCount.merge(edge.target(), 1, Integer::sum);
		}
		var all = links.graphItems(ownerId, folderId, folderIds);
		var paths = folders.paths(ownerId);
		var kept = all.stream()
				.sorted(Comparator.<LinkRepository.GraphItem>comparingInt(i -> -linkCount.getOrDefault(i.id(), 0))
						.thenComparing(LinkRepository.GraphItem::title).thenComparing(LinkRepository.GraphItem::id))
				.limit(MAX_GRAPH_NODES)
				.map(i -> new GraphNode(i.id(), i.type(), i.title(), paths.get(i.folderId()),
						linkCount.getOrDefault(i.id(), 0), i.stub(), i.x(), i.y()))
				.toList();
		var keptIds = kept.stream().map(GraphNode::id).collect(Collectors.toSet());
		var keptEdges = edges.stream().filter(e -> keptIds.contains(e.source()) && keptIds.contains(e.target()))
				.map(e -> new GraphEdge(e.source(), e.target())).toList();
		return new Graph(kept, keptEdges, all.size(), all.size() > kept.size());
	}

	/** Saves where the User left an Item in a Folder's graph (null for All Items); a 404 for a foreign one. */
	public void place(UUID ownerId, UUID folderId, UUID itemId, double x, double y) {
		requireScope(ownerId, folderId);
		items.requireLive(ownerId, itemId);
		links.place(ownerId, folderId, itemId, x, y);
	}

	/** Forgets every saved position of a Folder's graph (null for All Items), so it is laid out afresh. */
	public void resetLayout(UUID ownerId, UUID folderId) {
		requireScope(ownerId, folderId);
		links.clearPositions(ownerId, folderId);
	}

	private void requireScope(UUID ownerId, UUID folderId) {
		if (folderId != null) {
			folders.requireLive(ownerId, folderId);
		}
	}

	private List<Target> withPaths(UUID ownerId, List<Item> found) {
		if (found.isEmpty()) {
			return List.of();
		}
		var paths = folders.paths(ownerId);
		return found.stream().map(i -> new Target(i.id(), i.type(), i.title(), paths.get(i.folderId()))).toList();
	}

}
