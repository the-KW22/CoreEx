package com.coreex.links;

import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.common.ApiException;
import com.coreex.folders.FolderService;
import com.coreex.items.Item;
import com.coreex.items.ItemService;
import com.coreex.tags.Tag;
import com.coreex.tags.TagService;

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
	public record GraphNode(UUID id, Item.Type type, String title, UUID folderId, String folderPath, int linkCount, boolean stub,
			Double x, Double y, List<UUID> tagIds) {
	}

	public record GraphEdge(UUID source, UUID target) {
	}

	/** {@code total} counts every node before the cap; {@code truncated} says the cap cut some; {@code tags} has each Tag on a node once. */
	public record Graph(List<GraphNode> nodes, List<GraphEdge> edges, int total, boolean truncated, List<Tag> tags) {
	}

	/** Items joined by Links, and the most linked of them, which names the group. */
	public record Group(int size, UUID biggestId, String biggestTitle) {
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

	private final TagService tags;

	LinkService(LinkRepository links, ItemService items, FolderService folders, TagService tags) {
		this.links = links;
		this.items = items;
		this.folders = folders;
		this.tags = tags;
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
		var top = all.stream()
				.sorted(Comparator.<LinkRepository.GraphItem>comparingInt(i -> -linkCount.getOrDefault(i.id(), 0))
						.thenComparing(LinkRepository.GraphItem::title).thenComparing(LinkRepository.GraphItem::id))
				.limit(MAX_GRAPH_NODES).toList();
		var itemTags = tags.forItems(ownerId, top.stream().map(LinkRepository.GraphItem::id).toList());
		var kept = top.stream()
				.map(i -> new GraphNode(i.id(), i.type(), i.title(), i.folderId(), paths.get(i.folderId()),
						linkCount.getOrDefault(i.id(), 0), i.stub(), i.x(), i.y(), tagIds(itemTags, i.id())))
				.toList();
		var keptIds = kept.stream().map(GraphNode::id).collect(Collectors.toSet());
		var keptEdges = edges.stream().filter(e -> keptIds.contains(e.source()) && keptIds.contains(e.target()))
				.map(e -> new GraphEdge(e.source(), e.target())).toList();
		return new Graph(kept, keptEdges, all.size(), all.size() > kept.size(), distinctTags(itemTags));
	}

	// shortcut: the walk collects every neighbour before the 500 cap (two bind values each), fine for a personal vault;
	// cap the frontier when an Item can have thousands of Links.
	/**
	 * The local graph of an Item: the Item, the Items linked to or from it up to {@code depth} (1 or 2) Links away,
	 * and every Link among them. The cap keeps the Item and its nearest neighbours first. A 404 for a missing,
	 * trashed or foreign Item.
	 */
	public Graph localGraph(UUID ownerId, UUID itemId, int depth) {
		if (depth < 1 || depth > 2) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "The depth must be 1 or 2.");
		}
		items.requireLive(ownerId, itemId);
		var distance = new HashMap<UUID, Integer>(Map.of(itemId, 0));
		Set<UUID> frontier = Set.of(itemId);
		for (var d = 1; d <= depth && !frontier.isEmpty(); d++) {
			var next = new HashSet<UUID>();
			for (var edge : links.edgesTouching(ownerId, frontier)) {
				for (var id : List.of(edge.source(), edge.target())) {
					if (distance.putIfAbsent(id, d) == null) {
						next.add(id);
					}
				}
			}
			frontier = next;
		}
		var edges = links.edgesTouching(ownerId, distance.keySet()).stream()
				.filter(e -> distance.containsKey(e.source()) && distance.containsKey(e.target())).toList();
		var linkCount = new HashMap<UUID, Integer>();
		for (var edge : edges) {
			linkCount.merge(edge.source(), 1, Integer::sum);
			linkCount.merge(edge.target(), 1, Integer::sum);
		}
		var keptIds = distance.keySet().stream()
				.sorted(Comparator.<UUID>comparingInt(distance::get).thenComparingInt(id -> -linkCount.getOrDefault(id, 0))
						.thenComparing(id -> id))
				.limit(MAX_GRAPH_NODES).toList();
		var byId = items.findLive(ownerId, keptIds).stream().collect(Collectors.toMap(Item::id, i -> i));
		var itemTags = tags.forItems(ownerId, List.copyOf(byId.keySet()));
		var paths = folders.paths(ownerId);
		var kept = keptIds.stream().map(byId::get).filter(Objects::nonNull)
				.map(i -> new GraphNode(i.id(), i.type(), i.title(), i.folderId(), paths.get(i.folderId()),
						linkCount.getOrDefault(i.id(), 0), false, null, null, tagIds(itemTags, i.id())))
				.toList();
		return new Graph(kept, edges.stream().filter(e -> byId.containsKey(e.source()) && byId.containsKey(e.target()))
				.map(e -> new GraphEdge(e.source(), e.target())).toList(), distance.size(), distance.size() > kept.size(),
				distinctTags(itemTags));
	}

	/**
	 * The groups of two or more Items that Links join, biggest first. Stubs are left out, because they are outside the
	 * scope, so two groups that only meet through an outside Item stay two.
	 */
	public List<Group> groups(Graph graph) {
		var inside = graph.nodes().stream().filter(n -> !n.stub()).collect(Collectors.toMap(GraphNode::id, n -> n));
		var parent = new HashMap<UUID, UUID>();
		inside.keySet().forEach(id -> parent.put(id, id));
		for (var edge : graph.edges()) {
			if (inside.containsKey(edge.source()) && inside.containsKey(edge.target())) {
				parent.put(root(parent, edge.source()), root(parent, edge.target()));
			}
		}
		var members = inside.keySet().stream().collect(Collectors.groupingBy(id -> root(parent, id)));
		var biggest = Comparator.comparingInt(GraphNode::linkCount).reversed().thenComparing(GraphNode::title);
		return members.values().stream().filter(ids -> ids.size() > 1).map(ids -> {
			var top = ids.stream().map(inside::get).min(biggest).orElseThrow();
			return new Group(ids.size(), top.id(), top.title());
		}).sorted(Comparator.comparingInt(Group::size).reversed().thenComparing(Group::biggestTitle)).toList();
	}

	private static UUID root(Map<UUID, UUID> parent, UUID id) {
		var at = id;
		while (!parent.get(at).equals(at)) {
			at = parent.get(at);
		}
		parent.put(id, at);
		return at;
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

	private static List<UUID> tagIds(Map<UUID, List<Tag>> itemTags, UUID itemId) {
		return itemTags.getOrDefault(itemId, List.of()).stream().map(Tag::id).toList();
	}

	private static List<Tag> distinctTags(Map<UUID, List<Tag>> itemTags) {
		return itemTags.values().stream().flatMap(List::stream).distinct().sorted(Comparator.comparing(Tag::name)).toList();
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
