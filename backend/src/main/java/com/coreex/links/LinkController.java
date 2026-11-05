package com.coreex.links;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.items.Item;
import com.coreex.tags.TagColour;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE)
class LinkController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record ResolveRequest(@NotNull @Size(max = 100) List<UUID> ids) {
	}

	record LinkTargetResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Item.Type type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "The Folder path such as \"Work / CoreEx\", null at the top level") String folderPath) {

		static LinkTargetResponse of(LinkService.Target target) {
			return new LinkTargetResponse(target.id(), target.type(), target.title(), target.folderPath());
		}

	}

	record LinkTargetList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<LinkTargetResponse> items) {
	}

	record BacklinkResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title) {
	}

	record BacklinkList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<BacklinkResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	record GraphNodeResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Item.Type type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "The Folder the Item is in, null at the top level") UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "The Folder path such as \"Work / CoreEx\", null at the top level") String folderPath,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED,
					description = "Links to and from this Item within the graph") int linkCount,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED,
					description = "True for an Item outside the Folder, linked to or from inside it") boolean stub,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "Where the User left the node in this graph, null when never placed") Double x,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) Double y,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The Item's Tags, listed in the graph's tags") List<UUID> tagIds) {
	}

	record GraphTagResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true,
					description = "Null when the User has not picked one") TagColour colour) {
	}

	record GraphEdgeResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID source,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID target) {
	}

	record GraphResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<GraphNodeResponse> nodes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<GraphEdgeResponse> edges,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED,
					description = "Nodes before the cap of 500 most-linked") int total,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) boolean truncated,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Each Tag on a node, once") List<GraphTagResponse> tags) {

		static GraphResponse of(LinkService.Graph graph) {
			return new GraphResponse(graph.nodes().stream()
					.map(n -> new GraphNodeResponse(n.id(), n.type(), n.title(), n.folderId(), n.folderPath(), n.linkCount(), n.stub(),
							n.x(), n.y(), n.tagIds()))
					.toList(), graph.edges().stream().map(e -> new GraphEdgeResponse(e.source(), e.target())).toList(),
					graph.total(), graph.truncated(),
					graph.tags().stream().map(t -> new GraphTagResponse(t.id(), t.name(), t.colour())).toList());
		}

	}

	record PositionRequest(@NotNull @DecimalMin("-1000000") @DecimalMax("1000000") Double x,
			@NotNull @DecimalMin("-1000000") @DecimalMax("1000000") Double y) {
	}

	private final LinkService links;

	LinkController(LinkService links) {
		this.links = links;
	}

	/** Autocomplete for typing "[[": live Items whose title contains the text, with type and Folder path. */
	@GetMapping("/api/links/suggestions")
	LinkTargetList suggestions(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(defaultValue = "") @Size(max = 200) String q) {
		return new LinkTargetList(links.suggest(user.id(), q).stream().map(LinkTargetResponse::of).toList());
	}

	/** The current title, type and Folder path of Link targets. Missing, trashed and foreign ids are left out. */
	@PostMapping(value = "/api/links/resolve", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The ids that are live Items of the User", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = LinkTargetList.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	LinkTargetList resolve(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody ResolveRequest request) {
		return new LinkTargetList(
				links.resolve(user.id(), request.ids()).stream().map(LinkTargetResponse::of).toList());
	}

	/** The Knowledge Graph of a Folder and its subfolders, or of all Items without folderId. */
	@GetMapping("/api/links/graph")
	@ApiResponse(responseCode = "200", description = "Items as nodes and Links as edges", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = GraphResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Folder)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	GraphResponse graph(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(required = false) UUID folderId) {
		return GraphResponse.of(links.graph(user.id(), folderId));
	}

	/** The local graph of an Item: it, the Items up to depth (1 or 2) Links away, and the Links among them. */
	@GetMapping("/api/items/{id}/graph")
	@ApiResponse(responseCode = "200", description = "Items as nodes and Links as edges, the Item first",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = GraphResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST (a depth other than 1 or 2)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's or a trashed Item)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	GraphResponse localGraph(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @RequestParam(defaultValue = "1") int depth) {
		return GraphResponse.of(links.localGraph(user.id(), id, depth));
	}

	/** Saves where the User left an Item in the graph of a Folder, or of All Items without folderId. */
	@PutMapping(value = "/api/links/graph/positions/{itemId}", consumes = JSON)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Saved")
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Item or Folder)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void place(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID itemId, @RequestParam(required = false) UUID folderId,
			@Valid @RequestBody PositionRequest request) {
		links.place(user.id(), folderId, itemId, request.x(), request.y());
	}

	/** Reset layout: forgets every saved position in the graph of a Folder, or of All Items without folderId. */
	@DeleteMapping("/api/links/graph/positions")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Cleared")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Folder)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void resetLayout(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(required = false) UUID folderId) {
		links.resetLayout(user.id(), folderId);
	}

	/** The live Notes that link to the Item. */
	@GetMapping("/api/items/{id}/backlinks")
	@ApiResponse(responseCode = "200", description = "The Notes linking here", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = BacklinkList.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Item)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	BacklinkList backlinks(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		var list = links.backlinks(user.id(), id).stream().map(b -> new BacklinkResponse(b.id(), b.title())).toList();
		return new BacklinkList(list, list.size());
	}

}
