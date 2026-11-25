package com.coreex.access;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;
import com.coreex.identity.IdentityService;
import com.coreex.invites.InviteService;

@Service
class AccessRequestService {

	private static final Duration WINDOW = Duration.ofHours(1);

	private static final int TRIM_ABOVE = 1_000;

	private record Window(Instant start, int calls) {
	}

	private final AccessRequestRepository requests;

	private final IdentityService identity;

	private final InviteService invites;

	private final AccessRequestProperties properties;

	private final Clock clock;

	// shortcut: the per-address windows live in this process (expired ones are dropped once there are many), so with
	// more than one API instance each allows its own limit; the daily cap below is in the database and stays exact.
	// Upgrade to a shared store when the API runs on more than one instance.
	private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

	AccessRequestService(AccessRequestRepository requests, IdentityService identity, InviteService invites,
			AccessRequestProperties properties, Clock clock) {
		this.requests = requests;
		this.identity = identity;
		this.invites = invites;
		this.properties = properties;
		this.clock = clock;
	}

	/**
	 * Records the request. Returns normally whether or not the email was new, or already has an account, so the answer
	 * never says who asked before.
	 */
	void request(String email, String address) {
		var now = clock.instant();
		limitPerAddress(address, now);
		if (requests.countSince(now.minus(Duration.ofDays(1))) >= properties.perDay()) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
					"There are a lot of requests today. Please try again tomorrow.");
		}
		var normalized = email.trim().toLowerCase();
		if (!identity.hasUser(normalized)) {
			requests.insertIfNew(normalized);
		}
	}

	List<AccessRequestRepository.AccessRequest> listOpen(int page, int size) {
		return requests.findOpenPage(size, (long) page * size);
	}

	long totalOpen() {
		return requests.countOpen();
	}

	/** Makes the Invite and closes the request together: if the Invite cannot be made (the email has an account), the request stays open. */
	@Transactional
	void invite(UUID id) {
		var email = close(id, "INVITED");
		invites.issue(email);
	}

	@Transactional
	void dismiss(UUID id) {
		close(id, "DISMISSED");
	}

	private String close(UUID id, String status) {
		return requests.close(id, status).orElseThrow(() -> requests.exists(id)
				? new ApiException(HttpStatus.CONFLICT, "REQUEST_NOT_OPEN", "This request has already been dealt with.")
				: new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such request."));
	}

	private void limitPerAddress(String address, Instant now) {
		if (windows.size() > TRIM_ABOVE) {
			windows.values().removeIf(w -> !now.isBefore(w.start().plus(WINDOW)));
		}
		var window = windows.compute(address,
				(key, old) -> old == null || !now.isBefore(old.start().plus(WINDOW)) ? new Window(now, 1)
						: new Window(old.start(), old.calls() + 1));
		if (window.calls() > properties.perIpPerHour()) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED",
					"Too many requests from your connection. Please try again in an hour.");
		}
	}

}
