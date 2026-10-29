package com.coreex.search;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
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
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping(value = "/api/search", produces = MediaType.APPLICATION_JSON_VALUE)
class SearchController {

	// shortcut: at most 20 results per page, because each snippet is a ts_headline over up to 200,000 characters (about
	// 45 ms for the largest Note); raise it, or limit what is quoted, if pages need to be bigger.
	private static final int MAX_PAGE_SIZE = 20;

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record SegmentResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String text,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "True where the text matched the query") boolean match) {
	}

	record SearchHitResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Item.Type type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The Folder path such as \"Work / CoreEx\", null at the top level") String folderPath,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Plain text pieces, the matches flagged: never markup") List<SegmentResponse> snippet) {
	}

	record SearchPage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<SearchHitResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	record QuickHitResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Item.Type type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) String folderPath) {
	}

	record QuickList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<QuickHitResponse> items) {
	}

	private final SearchService search;

	SearchController(SearchService search) {
		this.search = search;
	}

	/**
	 * Finds live Items by Note title and body, Asset title and description, and Tag name (exact words, any language).
	 * The text may use "quoted phrases", {@code or} and {@code -excluded}. Filters combine; a Folder includes its
	 * subfolders.
	 */
	@GetMapping
	@ApiResponse(responseCode = "200", description = "A page of matches, best first", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = SearchPage.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such Folder or Tag", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	SearchPage search(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(defaultValue = "") @Size(max = 200) String q,
			@RequestParam(required = false) Item.Type type, @RequestParam(required = false) UUID tagId,
			@RequestParam(required = false) UUID folderId, @RequestParam(defaultValue = "0") int page,
			@RequestParam(defaultValue = "20") int size) {
		var safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
		var result = search.search(user.id(), q, type, tagId, folderId, Math.max(0, page), safeSize);
		var hits = result.hits().stream()
				.map(h -> new SearchHitResponse(h.id(), h.type(), h.title(), h.folderPath(), h.updatedAt(),
						h.snippet().stream().map(s -> new SegmentResponse(s.text(), s.match())).toList()))
				.toList();
		return new SearchPage(hits, result.total());
	}

	/** The quick switcher: titles that start with the text or are close to it; recently opened Items when empty. */
	@GetMapping("/quick")
	QuickList quick(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(defaultValue = "") @Size(max = 200) String q) {
		return new QuickList(search.quick(user.id(), q).stream()
				.map(h -> new QuickHitResponse(h.id(), h.type(), h.title(), h.folderPath())).toList());
	}

}
