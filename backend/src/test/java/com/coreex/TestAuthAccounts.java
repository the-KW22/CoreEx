package com.coreex;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;

import com.coreex.common.ApiException;
import com.coreex.identity.AuthAccounts;

/** Stands in for Supabase Auth's admin API: remembers which sign-ins were deleted. */
public class TestAuthAccounts implements AuthAccounts {

	private final Set<UUID> deleted = ConcurrentHashMap.newKeySet();

	private volatile boolean down;

	public boolean wasDeleted(UUID id) {
		return deleted.contains(id);
	}

	public void clear() {
		deleted.clear();
		down = false;
	}

	/** Makes every call fail like an unreachable Supabase Auth. */
	public void setDown(boolean down) {
		this.down = down;
	}

	@Override
	public void delete(UUID id) {
		if (down) {
			throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AUTH_UNAVAILABLE", "Sign-in service is not available.");
		}
		deleted.add(id);
	}

}
