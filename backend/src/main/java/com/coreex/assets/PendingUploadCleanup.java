package com.coreex.assets;

import java.time.Clock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.coreex.common.ApiException;
import com.coreex.storage.Storage;

/**
 * Removes uploads that never got confirmed, with their objects. Safe to run twice: a row is only deleted after its
 * object is gone, so a failure just means the next run tries again.
 */
@Component
class PendingUploadCleanup {

	private static final Logger log = LoggerFactory.getLogger(PendingUploadCleanup.class);

	private final AssetRepository assets;

	private final Storage storage;

	private final AssetProperties properties;

	private final Clock clock;

	PendingUploadCleanup(AssetRepository assets, Storage storage, AssetProperties properties, Clock clock) {
		this.assets = assets;
		this.storage = storage;
		this.properties = properties;
		this.clock = clock;
	}

	@Scheduled(initialDelayString = "PT5M", fixedDelayString = "PT1H")
	void scheduled() {
		run();
	}

	/** Returns how many pending uploads it removed. */
	int run() {
		var removed = 0;
		for (var pending : assets.findPendingOlderThan(clock.instant().minus(properties.pendingTtl()))) {
			try {
				storage.delete(pending.storageKey());
				assets.deletePending(pending.id());
				removed++;
			}
			catch (ApiException e) {
				log.warn("Could not delete the object of an old pending upload; will retry on the next run");
			}
		}
		return removed;
	}

}
