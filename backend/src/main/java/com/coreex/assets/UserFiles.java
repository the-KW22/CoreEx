package com.coreex.assets;

import java.util.UUID;

import org.springframework.stereotype.Component;

import com.coreex.storage.Storage;

/** Removes every stored file of one User, for when the person is removed. The rows go with the User's own row. */
@Component
public class UserFiles {

	private final AssetRepository assets;

	private final Storage storage;

	UserFiles(AssetRepository assets, Storage storage) {
		this.assets = assets;
		this.storage = storage;
	}

	/** Ready Assets (Trash included) and unconfirmed uploads. A failure stops here; calling again finishes the job. */
	public void deleteAllOf(UUID ownerId) {
		// shortcut: an upload link handed out just before the removal can still receive a file afterwards, which then
		// has no row; clean such files up if it ever matters. Also one Storage request per file, like the Trash; use Storage's bulk delete if a User holds thousands.
		assets.storageKeysOf(ownerId).forEach(storage::delete);
	}

}
