package com.coreex.links;

import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.items.Item;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
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
