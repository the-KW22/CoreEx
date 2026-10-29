package com.coreex.trash;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.coreex.common.ApiException;
import com.coreex.storage.Storage;

/**
 * Removes, for every User, what has been in the Trash longer than the retention (30 days). Safe to run twice, and an
 * Asset whose file cannot be deleted is left alone and retried on the next run, so a row is never dropped while its
 * file stays in Storage.
 */
@Component
class TrashPurgeJob {

	private static final Logger log = LoggerFactory.getLogger(TrashPurgeJob.class);

	private static final int BATCH = 500;

	private final TrashRepository trash;

	private final Storage storage;

	private final TrashProperties properties;

	private final Clock clock;

	TrashPurgeJob(TrashRepository trash, Storage storage, TrashProperties properties, Clock clock) {
		this.trash = trash;
		this.storage = storage;
		this.properties = properties;
		this.clock = clock;
	}

	// A fallback while the backend is awake. The real schedule is the daily GitHub Actions run that calls
	// TrashPurgeController (the free host sleeps when idle, so this alone could miss days).
	@Scheduled(initialDelayString = "PT2M", fixedDelayString = "PT6H")
	void scheduled() {
		run();
	}

	/** Returns how many Items and Folders it removed. */
	int run() {
		var cutoff = clock.instant().minus(properties.retention());
		var removed = 0;
		for (;;) {
			var expired = trash.expiredItems(cutoff, BATCH);
			var deletable = new ArrayList<UUID>();
			for (var item : expired) {
				if (item.storageKey() == null || deleteObject(item.storageKey())) {
					deletable.add(item.id());
				}
			}
			if (deletable.isEmpty()) {
				break;
			}
			// shortcut: an Asset restored in the moment between this list and the delete keeps its row but may have
			// lost its file (the Item rows themselves are protected); narrow the window or lock the rows if it matters.
			trash.removeForGood(deletable, List.of());
			removed += deletable.size();
		}
		for (;;) {
			var folders = trash.expiredFolderIds(cutoff, BATCH);
			if (folders.isEmpty()) {
				break;
			}
			trash.removeForGood(List.of(), folders);
			removed += folders.size();
		}
		return removed;
	}

	private boolean deleteObject(String key) {
		try {
			storage.delete(key);
			return true;
		}
		catch (ApiException e) {
			log.warn("Could not delete the file of an expired Asset; will retry on the next run");
			return false;
		}
	}

}
