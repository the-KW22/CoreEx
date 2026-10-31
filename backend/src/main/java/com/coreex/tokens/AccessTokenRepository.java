package com.coreex.tokens;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class AccessTokenRepository {

	private static final String COLUMNS = "id, owner_id, name, created_at, last_used_at, expires_at";

	private static final RowMapper<AccessToken> MAPPER = (rs, n) -> new AccessToken(rs.getObject("id", UUID.class),
			rs.getObject("owner_id", UUID.class), rs.getString("name"), instant(rs.getObject("created_at", OffsetDateTime.class)),
			instant(rs.getObject("last_used_at", OffsetDateTime.class)),
			instant(rs.getObject("expires_at", OffsetDateTime.class)));

	private final JdbcClient jdbc;

	AccessTokenRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	private static Instant instant(OffsetDateTime time) {
		return time == null ? null : time.toInstant();
	}

	AccessToken insert(UUID ownerId, String name, String hash, Instant now, Instant expiresAt) {
		return jdbc.sql("insert into access_tokens (owner_id, name, token_hash, created_at, expires_at) values (:owner, :name, :hash, :now, :expires) returning "
				+ COLUMNS).param("owner", ownerId).param("name", name).param("hash", hash)
				.param("now", Timestamp.from(now)).param("expires", expiresAt == null ? null : Timestamp.from(expiresAt))
				.query(MAPPER).single();
	}

	/** Every token the User has not revoked, expired ones included so the page can say so. */
	List<AccessToken> findByOwner(UUID ownerId) {
		return jdbc.sql("select " + COLUMNS + " from access_tokens where owner_id = :owner and revoked_at is null order by created_at desc, id")
				.param("owner", ownerId).query(MAPPER).list();
	}

	long countLive(UUID ownerId, Instant now) {
		return jdbc.sql("select count(*) from access_tokens where owner_id = :owner and revoked_at is null and (expires_at is null or expires_at > :now)")
				.param("owner", ownerId).param("now", Timestamp.from(now)).query(Long.class).single();
	}

	Optional<AccessToken> findLive(String hash, Instant now) {
		return jdbc.sql("select " + COLUMNS + " from access_tokens where token_hash = :hash and revoked_at is null and (expires_at is null or expires_at > :now)")
				.param("hash", hash).param("now", Timestamp.from(now)).query(MAPPER).optional();
	}

	/** False when the User has no such token. Revoking twice is fine. */
	boolean revoke(UUID ownerId, UUID id, Instant now) {
		return jdbc.sql("update access_tokens set revoked_at = coalesce(revoked_at, :now) where id = :id and owner_id = :owner")
				.param("now", Timestamp.from(now)).param("id", id).param("owner", ownerId).update() > 0;
	}

	void touchLastUsed(UUID id, Instant now, Instant staleBefore) {
		jdbc.sql("update access_tokens set last_used_at = :now where id = :id and (last_used_at is null or last_used_at <= :staleBefore)")
				.param("now", Timestamp.from(now)).param("id", id).param("staleBefore", Timestamp.from(staleBefore))
				.update();
	}

}
