package com.coreex.chat;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.assets.Asset;
import com.coreex.assets.AssetService;
import com.coreex.common.ApiException;
import com.coreex.identity.User;
import com.coreex.storage.Storage;

/**
 * Reads an Asset's file for Chat's read_asset tool (issue #204): images and PDFs only, at most 5 MB, and a PDF of at most 20
 * pages. It only ever reads the User's own live Assets (AssetService.get), so another User's file and one in the Trash are
 * "not found".
 */
@Component
class ChatAssets {

	static final long MAX_BYTES = 5_242_880L;

	static final int MAX_PAGES = 20;

	private static final Set<String> IMAGES = Set.of("image/png", "image/jpeg", "image/gif", "image/webp");

	private static final String PDF = "application/pdf";

	// shortcut: a plain count of "/Type /Page" objects in the file's text; a page inside a compressed object stream is not seen. Upgrade to a PDF library if the count ever misses.
	private static final Pattern PAGE = Pattern.compile("/Type\\s*/Page(?!s)");

	/** A file read for the model: which Asset it is, its title and type, and its bytes. */
	record File(UUID id, String title, String mediaType, byte[] data) {
	}

	private final AssetService assets;

	private final Storage storage;

	ChatAssets(AssetService assets, Storage storage) {
		this.assets = assets;
		this.storage = storage;
	}

	/** Reads the Asset named by the input's {@code id}. A refusal is an ApiException whose message the model is shown. */
	File read(User user, Map<String, Object> input) {
		var raw = input == null ? null : input.get("id");
		if (!(raw instanceof String text)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "id is required.");
		}
		UUID id;
		try {
			id = UUID.fromString(text);
		}
		catch (IllegalArgumentException e) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "id must be an Asset's id.");
		}
		var asset = assets.get(user, id);
		if (!IMAGES.contains(asset.mimeType()) && !PDF.equals(asset.mimeType())) {
			throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_TYPE", "Chat can read images and PDFs only.");
		}
		if (asset.sizeBytes() > MAX_BYTES) {
			throw tooLarge();
		}
		var data = bytes(asset);
		if (PDF.equals(asset.mimeType()) && pages(data) > MAX_PAGES) {
			throw tooLarge();
		}
		return new File(asset.id(), asset.title(), asset.mimeType(), data);
	}

	/** The file as the model is sent it again: empty when it is gone, in the Trash, or now refused for its size or type. */
	Optional<File> reload(User user, UUID id) {
		try {
			return Optional.of(read(user, Map.of("id", id.toString())));
		}
		catch (RuntimeException e) {
			return Optional.empty();
		}
	}

	private byte[] bytes(Asset asset) {
		var stream = storage.read(asset.storageKey())
				.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "The file is no longer available."));
		try (InputStream in = stream) {
			var data = in.readNBytes((int) MAX_BYTES + 1);
			if (data.length > MAX_BYTES) {
				throw tooLarge();
			}
			return data;
		}
		catch (IOException e) {
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE", "The file could not be read just now.");
		}
	}

	/** The number of pages a PDF has, counted from its page objects. */
	static int pages(byte[] pdf) {
		var matcher = PAGE.matcher(new String(pdf, StandardCharsets.ISO_8859_1));
		var count = 0;
		while (matcher.find()) {
			count++;
		}
		return count;
	}

	private static ApiException tooLarge() {
		return new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "That file is too large to read.");
	}

}
