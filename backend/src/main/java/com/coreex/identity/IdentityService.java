package com.coreex.identity;

import java.time.Clock;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;

@Service
public class IdentityService {

	private final UserRepository users;

	private final IdentityProperties properties;

	private final Clock clock;

	IdentityService(UserRepository users, IdentityProperties properties, Clock clock) {
		this.users = users;
		this.properties = properties;
		this.clock = clock;
	}

	/** Whether someone with this (lowercase) email already has an account. */
	public boolean hasUser(String email) {
		return users.existsByEmail(email);
	}

	/** The User behind a valid token. First sign-in provisions them, but only the owner or an invited person. */
	@Transactional
	User resolve(UUID id, String email) {
		var user = users.findById(id).or(() -> provision(id, email))
				.orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "NOT_INVITED",
						"CoreEx is invite-only. Ask the owner for an Invite."));
		if (user.status() == User.Status.DISABLED) {
			throw new ApiException(HttpStatus.FORBIDDEN, "USER_DISABLED", "This account is disabled.");
		}
		var now = clock.instant();
		users.touchLastActive(id, now, now.minus(properties.lastActiveThrottle()));
		return user;
	}

	// shortcut: two simultaneous first requests may make the loser see NOT_INVITED once, and an email already
	// held by a different auth id fails on the unique index; handle both if sign-ups ever collide.
	private Optional<User> provision(UUID id, String email) {
		if (email == null) {
			return Optional.empty();
		}
		var normalized = email.toLowerCase();
		User.Role role;
		if (normalized.equalsIgnoreCase(properties.ownerEmail())) {
			role = User.Role.ADMIN;
		}
		else if (users.acceptPendingInvite(normalized, clock.instant())) {
			role = User.Role.USER;
		}
		else {
			return Optional.empty();
		}
		users.insert(new User(id, normalized, role, User.Status.ACTIVE, null));
		return users.findById(id);
	}

}
