package com.coreex.identity;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;

@Service
public class IdentityService {

	private final UserRepository users;

	private final IdentityProperties properties;

	private final Clock clock;

	private record Cached(User user, Instant at) {
	}

	// shortcut: a per-process cache that this process clears when an Admin changes a User, so with more than one API
	// instance a Disabled User could keep access for up to the TTL on the others, add a shared cache or set the TTL
	// to zero then. It is also never trimmed, which is fine for the few Users of a personal knowledge base.
	private final ConcurrentHashMap<UUID, Cached> cache = new ConcurrentHashMap<>();

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
		// Every API call comes here. Asking the database each time costs three round trips, which is most of a
		// request's time when the database is in another region, so a User is remembered for a short while.
		var ttl = properties.userCacheTtl();
		var cached = cache.get(id);
		if (cached != null && clock.instant().isBefore(cached.at().plus(ttl))) {
			return cached.user();
		}
		var user = users.findById(id).or(() -> provision(id, email))
				.orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "NOT_INVITED",
						"CoreEx is invite-only. Ask the owner for an Invite."));
		if (user.status() == User.Status.DISABLED) {
			throw new ApiException(HttpStatus.FORBIDDEN, "USER_DISABLED", "This account is disabled.");
		}
		var now = clock.instant();
		users.touchLastActive(id, now, now.minus(properties.lastActiveThrottle()));
		if (!ttl.isZero()) {
			cache.put(id, new Cached(user, now));
		}
		return user;
	}

	/** Called after a User's status or Storage Quota changes (or they are removed), so the next request sees it. */
	public void forget(UUID id) {
		cache.remove(id);
	}

	// shortcut: an email already held by a different auth id fails on the unique index; handle it if sign-ups ever collide.
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
			// The Invite may have just been used by another request of this same person (the page and its sidebar
			// call the API together on a first sign-in); that request has created the User by now.
			return users.findById(id);
		}
		users.insert(new User(id, normalized, role, User.Status.ACTIVE, null));
		return users.findById(id);
	}

}
