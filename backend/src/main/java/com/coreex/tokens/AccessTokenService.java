package com.coreex.tokens;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.common.ApiException;
import com.coreex.identity.IdentityService;

@Service
class AccessTokenService {

	private static final String PREFIX = "cx_pat_";

	private static final Duration WINDOW = Duration.ofMinutes(1);

	/** A new token: the record to show, and the secret, which is never stored and never shown again. */
	record Created(AccessToken token, String secret) {
	}

	/** Too many calls in a minute; the filter turns this into 429 with a Retry-After header. */
	static final class RateLimitedException extends ApiException {

		private final long retryAfterSeconds;

		RateLimitedException(long retryAfterSeconds) {
			super(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "Too many calls. Try again in " + retryAfterSeconds + " seconds.");
			this.retryAfterSeconds = retryAfterSeconds;
		}

		long retryAfterSeconds() {
			return retryAfterSeconds;
		}

	}

	private record Window(Instant start, int calls) {
	}

	private final AccessTokenRepository tokens;

	private final IdentityService identity;

	private final AccessTokenProperties properties;

	private final Clock clock;

	private final SecureRandom random = new SecureRandom();

	// shortcut: the rate-limit windows live in this process and are never trimmed, so with more than one API instance
	// the limit is per instance, and the map grows by one entry per token used; move it to the database or a shared
	// cache when there are several instances.
	private final ConcurrentHashMap<UUID, Window> windows = new ConcurrentHashMap<>();

	AccessTokenService(AccessTokenRepository tokens, IdentityService identity, AccessTokenProperties properties,
			Clock clock) {
		this.tokens = tokens;
		this.identity = identity;
		this.properties = properties;
		this.clock = clock;
	}

	Created create(UUID ownerId, String name, Integer expiresInDays, boolean neverExpires) {
		var now = clock.instant();
		if (tokens.countLive(ownerId, now) >= properties.maxActive()) {
			throw new ApiException(HttpStatus.CONFLICT, "TOKEN_LIMIT",
					"You already have " + properties.maxActive() + " Access tokens. Revoke one first.");
		}
		var expiry = neverExpires ? null
				: now.plus(expiresInDays == null ? properties.defaultExpiry() : Duration.ofDays(expiresInDays));
		var bytes = new byte[32];
		random.nextBytes(bytes);
		var secret = PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		return new Created(tokens.insert(ownerId, name, hash(secret), now, expiry), secret);
	}

	List<AccessToken> list(UUID ownerId) {
		return tokens.findByOwner(ownerId);
	}

	void revoke(UUID ownerId, UUID id) {
		if (!tokens.revoke(ownerId, id, clock.instant())) {
			throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Access token.");
		}
	}

	/** Who a presented secret acts for. Refuses unknown, revoked and expired tokens, Disabled Users, and a busy token. */
	Agent authenticate(String secret) {
		var now = clock.instant();
		var token = tokens.findLive(hash(secret), now).orElseThrow(
				() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "That Access token is not valid."));
		var window = windows.compute(token.id(),
				(id, old) -> old == null || !now.isBefore(old.start().plus(WINDOW)) ? new Window(now, 1)
						: new Window(old.start(), old.calls() + 1));
		if (window.calls() > properties.callsPerMinute()) {
			throw new RateLimitedException(Math.max(1, Duration.between(now, window.start().plus(WINDOW)).toSeconds()));
		}
		tokens.touchLastUsed(token.id(), now, now.minus(properties.lastUsedThrottle()));
		return new Agent(identity.resolve(token.ownerId(), null), token.name());
	}

	private static String hash(String secret) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

}
