package com.coreex.identity;

import java.util.UUID;

/** The only way the backend changes Supabase Auth. Tests replace it with a fake. */
public interface AuthAccounts {

	/** Removes the person's sign-in. Harmless when it is already gone. Throws {@code 503} when Auth cannot be reached. */
	void delete(UUID id);

}
