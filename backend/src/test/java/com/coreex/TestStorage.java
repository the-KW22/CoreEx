package com.coreex;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;

import com.coreex.common.ApiException;
import com.coreex.storage.Storage;

/** The in-memory Storage fake: the only fake in the test suite. A test "uploads" by calling {@link #put}. */
public class TestStorage implements Storage {

	private final Map<String, StoredObject> objects = new ConcurrentHashMap<>();

	private volatile boolean down;

	/** What the browser's PUT to the presigned URL would have stored. */
	public void put(String key, long size, String contentType) {
		objects.put(key, new StoredObject(size, contentType));
	}

	public boolean exists(String key) {
		return objects.containsKey(key);
	}

	public Set<String> keys() {
		return Set.copyOf(objects.keySet());
	}

	public void clear() {
		objects.clear();
		down = false;
	}

	/** Makes every call fail like an unreachable Storage. */
	public void setDown(boolean down) {
		this.down = down;
	}

	@Override
	public URI presignUpload(String key) {
		requireUp();
		return URI.create("https://storage.test/upload/" + key);
	}

	@Override
	public URI presignDownload(String key, String downloadName, Duration ttl) {
		requireUp();
		var url = "https://storage.test/object/" + key + "?ttl=" + ttl.toSeconds();
		return URI.create(downloadName == null ? url : url + "&download=" + downloadName.replace(' ', '_'));
	}

	@Override
	public Optional<StoredObject> head(String key) {
		requireUp();
		return Optional.ofNullable(objects.get(key));
	}

	@Override
	public void delete(String key) {
		requireUp();
		objects.remove(key);
	}

	private void requireUp() {
		if (down) {
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE", "Storage is down.");
		}
	}

}
