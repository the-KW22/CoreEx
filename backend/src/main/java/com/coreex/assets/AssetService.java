package com.coreex.assets;

import java.net.URI;
import java.time.Clock;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.common.ApiException;
import com.coreex.folders.FolderService;
import com.coreex.identity.User;
import com.coreex.storage.Storage;

/**
 * Upload flow: intent (checks type, size and quota, records a pending upload, hands out a presigned PUT URL), the
 * browser PUTs the file to Storage, confirm (reads the stored object's real size and type, then creates the Asset).
 * Storage is never called inside a database transaction.
 */
@Service
public class AssetService {

	record Upload(UUID id, URI url) {
	}

	record Url(URI url, long expiresInSeconds) {
	}

	record Usage(long usedBytes, long quotaBytes) {
	}

	private static final Logger log = LoggerFactory.getLogger(AssetService.class);

	// Never SVG: an SVG can carry script. The value is the extension used for download names.
	private static final Map<String, String> ALLOWED = Map.of("image/png", "png", "image/jpeg", "jpg", "image/webp",
			"webp", "image/gif", "gif", "application/pdf", "pdf");

	private final AssetRepository assets;

	private final Storage storage;

	private final FolderService folders;

	private final AssetProperties properties;

	private final Clock clock;

	AssetService(AssetRepository assets, Storage storage, FolderService folders, AssetProperties properties,
			Clock clock) {
		this.assets = assets;
		this.storage = storage;
		this.folders = folders;
		this.properties = properties;
		this.clock = clock;
	}

	Upload createUpload(User user, String filename, String mimeType, long sizeBytes, UUID folderId) {
		var mime = normalize(mimeType);
		requireAllowed(mime);
		requireWithinMax(sizeBytes);
		if (folderId != null) {
			folders.requireLive(user.id(), folderId);
		}
		requireRoom(user, sizeBytes);
		// Unconfirmed objects are not counted in the quota, and the bucket only limits each one, so the number of open
		// uploads is limited instead. They disappear after 24 hours.
		if (assets.countPending(user.id()) >= properties.maxPendingUploads()) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_UPLOADS",
					"You have too many unfinished uploads. Wait a little, then try again.");
		}
		var key = user.id() + "/" + UUID.randomUUID();
		var id = assets.insertPending(user.id(), folderId, key, titleFrom(filename), mime, sizeBytes, clock.instant());
		return new Upload(id, storage.presignUpload(key));
	}

	/** Creates the Asset from a finished upload, trusting the stored object's size and type, not the browser's claim. */
	Asset confirm(User user, UUID uploadId) {
		var pending = assets.findPending(user.id(), uploadId).orElseThrow(AssetService::noSuchUpload);
		var stored = storage.head(pending.storageKey()).orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,
				"UPLOAD_MISSING", "The file has not been uploaded yet. Upload it, then confirm."));
		try {
			requireWithinMax(stored.size());
			// shortcut: the stored type is compared with the declared one, but the file's bytes are not sniffed;
			// add a magic-byte check if files are ever served from the app's own origin.
			if (!normalize(stored.contentType()).equals(pending.mimeType())) {
				throw unsupported();
			}
			// shortcut: two confirms at the same moment could each pass this check and end slightly over the quota,
			// serialize per User if the overshoot ever matters.
			requireRoom(user, stored.size());
		}
		catch (ApiException refused) {
			discard(pending);
			throw refused;
		}
		if (pending.folderId() != null) {
			folders.requireLive(user.id(), pending.folderId());
		}
		var id = assets.promote(pending, stored.size()).orElseThrow(AssetService::noSuchUpload);
		return get(user, id);
	}

	public Asset get(User user, UUID id) {
		return assets.find(user.id(), id).orElseThrow(AssetService::noSuchAsset);
	}

	/** A short-lived URL to view the file inline, or to download it under the Asset's title. Owner and live only. */
	Url url(User user, UUID id, boolean download) {
		var asset = get(user, id);
		var ttl = properties.urlTtl();
		return new Url(storage.presignDownload(asset.storageKey(), download ? downloadName(asset) : null, ttl),
				ttl.toSeconds());
	}

	public Asset update(User user, UUID id, String title, String description) {
		if (!assets.update(user.id(), id, title, description)) {
			throw noSuchAsset();
		}
		return get(user, id);
	}

	/** Moves the Asset to the Trash. Its file stays in Storage, and still counts as used, until the Trash purges it. */
	public void delete(User user, UUID id) {
		if (!assets.softDelete(user.id(), id, clock.instant())) {
			throw noSuchAsset();
		}
	}

	Usage usage(User user) {
		return new Usage(assets.usedBytes(user.id()), quotaOf(user));
	}

	private long quotaOf(User user) {
		return user.storageQuotaBytes() != null ? user.storageQuotaBytes() : properties.defaultQuotaBytes();
	}

	private void requireRoom(User user, long sizeBytes) {
		if (assets.usedBytes(user.id()) + sizeBytes > quotaOf(user)) {
			throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "QUOTA_EXCEEDED",
					"This file does not fit in your storage quota. Delete something for good, then try again.");
		}
	}

	private void requireWithinMax(long sizeBytes) {
		if (sizeBytes > properties.maxSizeBytes()) {
			throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
					"Files can be at most " + properties.maxSizeBytes() / (1024 * 1024) + " MB.");
		}
	}

	private static void requireAllowed(String mime) {
		if (!ALLOWED.containsKey(mime)) {
			throw unsupported();
		}
	}

	private static ApiException unsupported() {
		return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_TYPE",
				"Only PNG, JPG, WebP, GIF and PDF files can be uploaded.");
	}

	// "image/png; charset=binary" and "IMAGE/PNG" are both "image/png".
	private static String normalize(String contentType) {
		if (contentType == null) {
			return "";
		}
		var semicolon = contentType.indexOf(';');
		return (semicolon < 0 ? contentType : contentType.substring(0, semicolon)).trim().toLowerCase(Locale.ROOT);
	}

	// The title starts as the filename, without any folder path the browser may include.
	private static String titleFrom(String filename) {
		var name = filename.substring(Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\')) + 1).trim();
		return name.isEmpty() ? "Untitled" : name;
	}

	private static String downloadName(Asset asset) {
		var name = asset.title().replaceAll("[\\p{Cntrl}\"\\\\/:*?<>|]", "_").trim();
		var extension = "." + ALLOWED.get(asset.mimeType());
		return name.toLowerCase(Locale.ROOT).endsWith(extension) ? name : name + extension;
	}

	/** Removes the pending upload and its object after a refused confirm. A failure here must not hide the refusal. */
	private void discard(AssetRepository.Pending pending) {
		try {
			storage.delete(pending.storageKey());
		}
		catch (ApiException e) {
			log.warn("Could not delete the object of a refused upload; the cleanup job will retry");
			return;
		}
		assets.deletePending(pending.id());
	}

	private static ApiException noSuchUpload() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such upload.");
	}

	private static ApiException noSuchAsset() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Asset.");
	}

}
