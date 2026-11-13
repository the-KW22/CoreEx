package com.coreex.mcp;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.assets.AssetService;
import com.coreex.common.ApiException;
import com.coreex.folders.FolderService;
import com.coreex.identity.User;
import com.coreex.items.Item;
import com.coreex.items.ItemService;
import com.coreex.links.LinkService;
import com.coreex.notes.NoteService;
import com.coreex.search.SearchService;
import com.coreex.tags.TagService;
import com.coreex.trash.TrashService;

import io.modelcontextprotocol.common.McpTransportContext;

/**
 * What an Agent can read. Every tool goes through a feature's service with the calling User's id, so the rules of the
 * REST API (scoping, the Trash hiding things) apply here too (ADR 0007).
 */
@Component
class ReadTools {

	private static final int PAGE_SIZE = 50;

	/** About 90 KB of result. Past it an Agent is told to narrow by Folder or Item. */
	static final int MAX_GRAPH_EDGES = 1000;

	record TagRef(UUID id, String name) {
	}

	record AssetLink(String url, long expiresInSeconds) {
	}

	record ItemSummary(UUID id, Item.Type type, String title, UUID folderId, Instant updatedAt,
			String snippet, Long sizeBytes,
			List<String> tags) {
	}

	record ItemList(List<ItemSummary> items, long total,
			String nextCursor) {
	}

	record SearchHit(UUID id, Item.Type type, String title, String folderPath, Instant updatedAt,
			String snippet) {
	}

	record SearchResult(List<SearchHit> hits, long total, String nextCursor, boolean exactOnly) {
	}

	record BacklinkRef(UUID id, String title) {
	}

	record ItemDetail(UUID id, Item.Type type, String title, UUID folderId, String folderPath, Instant updatedAt,
			List<TagRef> tags, List<BacklinkRef> backlinks, String markdown, Integer version, String description,
			String mimeType, Long sizeBytes) {
	}

	record FolderInfo(UUID id, UUID parentId, String name, String path, long itemCount) {
	}

	record FolderList(List<FolderInfo> folders) {
	}

	record GraphNodeInfo(UUID id, Item.Type type, String title, String folderPath, int linkCount, boolean stub) {
	}

	record GraphEdgeInfo(UUID source, UUID target) {
	}

	record GraphGroup(int size, UUID biggestId, String biggestTitle) {
	}

	record GraphResult(List<GraphNodeInfo> nodes, List<GraphEdgeInfo> edges, int total, boolean truncated,
			List<GraphGroup> groups, int edgeTotal, boolean edgesTruncated) {
	}

	record SuggestedLinkInfo(UUID source, String sourceTitle, UUID target, String targetTitle, double similarity) {
	}

	record SuggestedLinks(List<SuggestedLinkInfo> pairs) {
	}

	record TagInfo(UUID id, String name, String colour, long itemCount) {
	}

	record TagList(List<TagInfo> tags) {
	}

	record TrashEntry(String kind, UUID id, String title, Instant deletedAt, long daysRemaining, long folderCount,
			long itemCount) {
	}

	record TrashList(List<TrashEntry> entries, long total, String nextCursor) {
	}

	private final ItemService items;

	private final NoteService notes;

	private final AssetService assets;

	private final SearchService search;

	private final FolderService folders;

	private final TagService tags;

	private final LinkService links;

	private final TrashService trash;

	ReadTools(ItemService items, NoteService notes, AssetService assets, SearchService search, FolderService folders,
			TagService tags, LinkService links, TrashService trash) {
		this.items = items;
		this.notes = notes;
		this.assets = assets;
		this.search = search;
		this.folders = folders;
		this.tags = tags;
		this.links = links;
		this.trash = trash;
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "search", description = "Find Notes and Assets by words in a Note's title or text, an Asset's title or description, or a Tag name, and Notes also by meaning, so a question in your own words can find a Note that uses other words (English). Use this when you know what you are looking for; use list_items to browse. Words are matched exactly (ignoring case); put a phrase in \"quotes\", use or for either word, and -word to leave one out. Returns titles, ids and snippets, not full Notes: call get_item to read one. exactOnly true means the search by meaning could not run, so only exact words were matched.")
	SearchResult search(McpTransportContext context,
			@McpToolParam(description = "What to search for") String query,
			@McpToolParam(required = false, description = "Only Notes (NOTE) or only Assets (ASSET)") Item.Type type,
			@McpToolParam(required = false, description = "Only Items with this Tag (an id from list_tags)") UUID tagId,
			@McpToolParam(required = false, description = "Only Items in this Folder or its subfolders (an id from list_folders)") UUID folderId,
			@McpToolParam(required = false, description = "The nextCursor of the previous page") String cursor) {
		var page = page(cursor);
		var found = search.search(user(context).id(), query, type, tagId, folderId, page, PAGE_SIZE);
		var hits = found.hits().stream().map(h -> new SearchHit(h.id(), h.type(), h.title(), h.folderPath(), h.updatedAt(),
				snippet(h.snippet()))).toList();
		return new SearchResult(hits, found.total(), next(page, found.total()), found.exactOnly());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "list_items", description = "List Notes and Assets, most recently updated first, 50 per page. Use this to browse a Folder, a Tag or one type of Item; use search to find something by words. Returns summaries with Tags and a short preview: call get_item to read one.")
	ItemList listItems(McpTransportContext context,
			@McpToolParam(required = false, description = "Only Items in this Folder (an id from list_folders)") UUID folderId,
			@McpToolParam(required = false, description = "Only Items with this Tag (an id from list_tags)") UUID tagId,
			@McpToolParam(required = false, description = "Only Notes (NOTE) or only Assets (ASSET)") Item.Type type,
			@McpToolParam(required = false, description = "The nextCursor of the previous page") String cursor) {
		var user = user(context);
		var page = page(cursor);
		var total = items.total(user.id(), folderId, tagId, type);
		var list = items.list(user.id(), folderId, tagId, type, page, PAGE_SIZE).stream().map(i -> new ItemSummary(i.id(),
				i.type(), i.title(), i.folderId(), i.updatedAt(), i.snippet(), i.sizeBytes(),
				i.tags().stream().map(t -> t.name()).toList())).toList();
		return new ItemList(list, total, next(page, total));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "get_item", description = "Read one Note or Asset by id. For a Note: its full Markdown, its version (you need it to edit the Note), Tags, Folder and the Notes that link to it (Backlinks). For an Asset: its title, description, type and size; the file itself is not sent, use get_asset_url to download it.")
	ItemDetail getItem(McpTransportContext context, @McpToolParam(description = "The Item's id") UUID id) {
		var user = user(context);
		var item = items.findLive(user.id(), List.of(id)).stream().findFirst()
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Item."));
		var path = item.folderId() == null ? null : folders.paths(user.id()).get(item.folderId());
		var itemTags = tags.forItem(user.id(), id).stream().map(t -> new TagRef(t.id(), t.name())).toList();
		var backlinks = links.backlinks(user.id(), id).stream().map(b -> new BacklinkRef(b.id(), b.title())).toList();
		if (item.type() == Item.Type.NOTE) {
			var note = notes.get(user.id(), id);
			return new ItemDetail(id, item.type(), note.title(), note.folderId(), path, note.updatedAt(), itemTags,
					backlinks, note.body(), note.version(), null, null, null);
		}
		var asset = assets.get(user, id);
		return new ItemDetail(id, item.type(), asset.title(), asset.folderId(), path, asset.updatedAt(), itemTags,
				backlinks, null, null, asset.description(), asset.mimeType(), asset.sizeBytes());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "get_asset_url", description = "Get a link to download an Asset's file (an image or PDF): fetch it with an HTTP GET, for example curl -o file \"<url>\", and read the saved file yourself. The link is a bearer link: anyone who has it can download the file until it expires (expiresInSeconds, a few minutes), so fetch it right away and do not share it or write it down. Ask again for a fresh one when it has expired. Only the User's own Assets that are not in the Trash have one.")
	AssetLink getAssetUrl(McpTransportContext context, @McpToolParam(description = "The Asset's id") UUID id) {
		var link = assets.url(user(context), id, true);
		return new AssetLink(link.url().toString(), link.expiresInSeconds());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "list_folders", description = "List every Folder with its id, parent id, full path and how many Items it holds directly. Use it to learn how the knowledge base is organised and to get a Folder id for the other tools.")
	FolderList listFolders(McpTransportContext context) {
		var user = user(context);
		var paths = folders.paths(user.id());
		return new FolderList(folders.list(user.id()).stream()
				.map(f -> new FolderInfo(f.id(), f.parentId(), f.name(), paths.get(f.id()), f.itemCount())).toList());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "get_graph", description = "Map how Items link to each other: every Note and Asset as a node with its linkCount (Links to and from it), and every Link as an edge from the linking Note to its target. Use it to find orphans (linkCount 0), hubs (the highest linkCount) and groups of Items that never connect: groups lists every set of two or more Items that Links join, biggest first, with its size and its most-linked Item, leaving out stubs. Covers a Folder and its subfolders, or everything without folderId. An Item outside the Folder that is linked to or from it is included with stub true. At most 500 nodes, the most-linked first: total is how many there were and truncated says some were left out. At most 1000 edges, those between the most-linked Items first: edgeTotal is how many there were and edgesTruncated says some were left out, so pass folderId or itemId to see them all. linkCount and groups always count every Link. With itemId it maps what is around one Note or Asset instead: that Item (first) and the Items linked to or from it, up to depth Links away, nearest first. Returns titles and ids, not text: call get_item to read one.")
	GraphResult getGraph(McpTransportContext context,
			@McpToolParam(required = false, description = "Only this Folder and its subfolders (an id from list_folders)") UUID folderId,
			@McpToolParam(required = false, description = "Only what is around this Item (folderId is then ignored)") UUID itemId,
			@McpToolParam(required = false, description = "With itemId: 1 for the Items linked to or from it (the default), 2 to add their neighbours too") Integer depth) {
		var userId = user(context).id();
		var graph = itemId == null ? links.graph(userId, folderId)
				: links.localGraph(userId, itemId, depth == null ? 1 : depth);
		return new GraphResult(
				graph.nodes().stream().map(n -> new GraphNodeInfo(n.id(), n.type(), n.title(), n.folderPath(),
						n.linkCount(), n.stub())).toList(),
				strongestEdges(graph, MAX_GRAPH_EDGES), graph.total(), graph.truncated(),
				links.groups(graph).stream().map(g -> new GraphGroup(g.size(), g.biggestId(), g.biggestTitle())).toList(),
				graph.edges().size(), graph.edges().size() > MAX_GRAPH_EDGES);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "suggest_links", description = "Find pairs of Notes that are close in meaning but not linked, closest first, up to the 3 closest for each Note. Use it to find Links worth making: read both Notes with get_item before linking, then add a [[Link]] with edit_note. These are suggestions, not Links, and empty pairs may just mean the Notes have not been embedded yet. Only Notes, not Assets. Covers a Folder and its subfolders, or everything without folderId.")
	SuggestedLinks suggestLinks(McpTransportContext context,
			@McpToolParam(required = false, description = "Only this Folder and its subfolders (an id from list_folders)") UUID folderId) {
		return new SuggestedLinks(links.suggestedLinks(user(context).id(), folderId).stream().map(s -> new SuggestedLinkInfo(
				s.source(), s.sourceTitle(), s.target(), s.targetTitle(), s.similarity())).toList());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "list_tags", description = "List every Tag with its id, colour and how many Items have it. Use it to get a Tag id for search or list_items.")
	TagList listTags(McpTransportContext context) {
		return new TagList(tags.list(user(context).id()).stream().map(
				t -> new TagInfo(t.id(), t.name(), t.colour() == null ? null : t.colour().name(), t.itemCount())).toList());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "list_trash", description = "List what is in the Trash, newest first, 50 per page, with the days left before it is removed for good. Trashed Notes and Assets do not appear in any other tool.")
	TrashList listTrash(McpTransportContext context,
			@McpToolParam(required = false, description = "The nextCursor of the previous page") String cursor) {
		var user = user(context);
		var page = page(cursor);
		var total = trash.total(user.id());
		var entries = trash.list(user.id(), page, PAGE_SIZE).stream().map(r -> new TrashEntry(r.entry().kind().name(),
				r.entry().id(), r.entry().title(), r.entry().deletedAt(), r.daysRemaining(), r.entry().folderCount(),
				r.entry().itemCount())).toList();
		return new TrashList(entries, total, next(page, total));
	}

	/** The Links between the most-linked Items, so the hubs stay readable when not all fit. */
	static List<GraphEdgeInfo> strongestEdges(LinkService.Graph graph, int limit) {
		var counts = graph.nodes().stream()
				.collect(java.util.stream.Collectors.toMap(LinkService.GraphNode::id, LinkService.GraphNode::linkCount));
		return graph.edges().stream()
				.sorted(java.util.Comparator.comparingInt(
						(LinkService.GraphEdge e) -> -(counts.getOrDefault(e.source(), 0) + counts.getOrDefault(e.target(), 0))))
				.limit(limit).map(e -> new GraphEdgeInfo(e.source(), e.target())).toList();
	}

	private static User user(McpTransportContext context) {
		return McpConfig.agent(context).user();
	}

	/** A cursor is the page number as text; none means the first page. */
	private static int page(String cursor) {
		if (cursor == null || cursor.isBlank()) {
			return 0;
		}
		try {
			return Math.max(0, Integer.parseInt(cursor));
		}
		catch (NumberFormatException e) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "That cursor is not valid.");
		}
	}

	private static String next(int page, long total) {
		return (long) (page + 1) * PAGE_SIZE < total ? String.valueOf(page + 1) : null;
	}

	private static String snippet(List<SearchService.Segment> segments) {
		var text = new StringBuilder();
		segments.forEach(s -> text.append(s.match() ? "**" + s.text() + "**" : s.text()));
		return text.toString();
	}

}
