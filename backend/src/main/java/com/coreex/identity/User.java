package com.coreex.identity;

import java.util.UUID;

/**
 * The signed-in person. The id is the Supabase auth user id. A null Storage Quota means "the configured default".
 */
public record User(UUID id, String email, Role role, Status status, Long storageQuotaBytes) {

	public enum Role {
		ADMIN, USER
	}

	public enum Status {
		ACTIVE, DISABLED
	}

}
