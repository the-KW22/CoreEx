package com.coreex.storage;

import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;

/**
 * The only way the rest of the backend touches file storage. Everything else depends on this interface, never on
 * Supabase; tests replace it with an in-memory fake. Every method throws {@code 503 STORAGE_UNAVAILABLE} when
 * Storage cannot be reached.
 */
public interface Storage {

	/** What Storage reports about a stored object. */
	record StoredObject(long size, String contentType) {
	}

	/** A URL the browser can PUT the file to. Storage decides how long it stays valid. */
	URI presignUpload(String key);

	/** A short-lived URL the browser can GET the file from; a download name makes it a download, not inline. */
	URI presignDownload(String key, String downloadName, Duration ttl);

	/** The stored object's real size and type, or empty when there is no such object. */
	Optional<StoredObject> head(String key);

	/** The object's bytes as a stream the caller must close, or empty when there is no such object. */
	Optional<InputStream> read(String key);

	/** Removes the object. Harmless when it is already gone. */
	void delete(String key);

}
