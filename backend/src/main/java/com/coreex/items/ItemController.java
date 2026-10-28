package com.coreex.items;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;

@RestController
@RequestMapping(value = "/api/items", produces = MediaType.APPLICATION_JSON_VALUE)
class ItemController {

	private static final int MAX_PAGE_SIZE = 100;

	record ItemResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Item.Type type,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

		static ItemResponse of(Item item) {
			return new ItemResponse(item.id(), item.type(), item.title(), item.updatedAt());
		}

	}

	record ItemPage(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<ItemResponse> items,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long total) {
	}

	private final ItemService items;

	ItemController(ItemService items) {
		this.items = items;
	}

	/** The signed-in User's live Items, most recently updated first. */
	@GetMapping
	ItemPage list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "50") int size) {
		var safeSize = Math.min(MAX_PAGE_SIZE, Math.max(1, size));
		var list = items.list(user.id(), Math.max(0, page), safeSize).stream().map(ItemResponse::of).toList();
		return new ItemPage(list, items.total(user.id()));
	}

}
