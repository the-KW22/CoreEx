package com.coreex.identity;

import java.util.UUID;

/** The signed-in person. The id is the Supabase auth user id. */
public record User(UUID id, String email, Role role, Status status) {

	public enum Role {
		ADMIN, USER
	}

	public enum Status {
		ACTIVE, DISABLED
	}

}
