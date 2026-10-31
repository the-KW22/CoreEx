package com.coreex.tags;

import java.util.List;
import java.util.UUID;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;

/**
 * Tags never call the items feature: whoever attaches or detaches a Tag first checks that the Item is live and
 * the User's.
 */
@Service
public class TagService {

	public record TagCount(UUID id, String name, TagColour colour, long itemCount) {
	}

	private final TagRepository tags;

	TagService(TagRepository tags) {
		this.tags = tags;
	}

	/** A 404 unless the Tag exists and is the User's. */
	public Tag requireTag(UUID ownerId, UUID id) {
		return tags.find(ownerId, id).orElseThrow(TagService::notFound);
	}

	public List<Tag> forItem(UUID ownerId, UUID itemId) {
		return tags.forItem(ownerId, itemId);
	}

	/** Puts the Tag with this name (found ignoring case, or created) on the Item. Adding it twice changes nothing. */
	@Transactional
	public Tag attach(UUID ownerId, UUID itemId, String name) {
		var tag = tags.findOrCreate(ownerId, name);
		// Deleted in the moment since it was found: create it again. Locked from here, it can no longer be deleted.
		if (!tags.lock(tag.id())) {
			tag = tags.findOrCreate(ownerId, name);
			tags.lock(tag.id());
		}
		tags.link(itemId, tag.id());
		return tag;
	}

	/** Takes the Tag off the Item and keeps the Tag. Harmless when it was not on the Item. */
	@Transactional
	public void detach(UUID ownerId, UUID itemId, UUID tagId) {
		requireTag(ownerId, tagId);
		tags.unlink(itemId, tagId);
	}

	List<TagCount> list(UUID ownerId) {
		return tags.listWithCounts(ownerId).stream().map(t -> new TagCount(t.id(), t.name(), t.colour(), t.itemCount())).toList();
	}

	Tag create(UUID ownerId, String name) {
		try {
			return tags.create(ownerId, name);
		}
		catch (DuplicateKeyException e) {
			throw tagExists();
		}
	}

	Tag rename(UUID ownerId, UUID id, String name) {
		try {
			if (!tags.rename(ownerId, id, name)) {
				throw notFound();
			}
		}
		catch (DuplicateKeyException e) {
			throw tagExists();
		}
		return requireTag(ownerId, id);
	}

	/** Sets the colour, or null for automatic. */
	Tag setColour(UUID ownerId, UUID id, TagColour colour) {
		if (!tags.setColour(ownerId, id, colour)) {
			throw notFound();
		}
		return requireTag(ownerId, id);
	}

	/** Deletes the Tag and its links; the Items stay. */
	void delete(UUID ownerId, UUID id) {
		if (!tags.delete(ownerId, id)) {
			throw notFound();
		}
	}

	private static ApiException tagExists() {
		return new ApiException(HttpStatus.CONFLICT, "TAG_EXISTS", "You already have a Tag with this name.");
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Tag.");
	}

}
