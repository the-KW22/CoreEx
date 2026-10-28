package com.coreex.items;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

@Service
class ItemService {

	private final ItemRepository items;

	ItemService(ItemRepository items) {
		this.items = items;
	}

	List<Item> list(UUID ownerId, int page, int size) {
		return items.findLivePage(ownerId, size, (long) page * size);
	}

	long total(UUID ownerId) {
		return items.countLive(ownerId);
	}

}
