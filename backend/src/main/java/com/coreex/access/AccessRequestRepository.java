package com.coreex.access;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class AccessRequestRepository {

	/** What an Admin sees of a request: the email and the date, nothing else (ADR 0004). */
	record AccessRequest(UUID id, String email, Instant createdAt) {
	}

	private static final RowMapper<AccessRequest> MAPPER = (rs, n) -> new AccessRequest(rs.getObject("id", UUID.class),
			rs.getString("email"), rs.getObject("created_at", OffsetDateTime.class).toInstant());

	private final JdbcClient jdbc;

	AccessRequestRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Does nothing when the email already asked (whatever became of that request). */
	void insertIfNew(String email) {
		jdbc.sql("insert into access_request (email) values (:email) on conflict (email) do nothing")
				.param("email", email).update();
	}

	long countSince(Instant since) {
		return jdbc.sql("select count(*) from access_request where created_at >= :since")
				.param("since", OffsetDateTime.ofInstant(since, ZoneOffset.UTC)).query(Long.class).single();
	}

	List<AccessRequest> findOpenPage(int limit, long offset) {
		return jdbc.sql("select id, email, created_at from access_request where status = 'OPEN' order by created_at desc, id limit :limit offset :offset")
				.param("limit", limit).param("offset", offset).query(MAPPER).list();
	}

	long countOpen() {
		return jdbc.sql("select count(*) from access_request where status = 'OPEN'").query(Long.class).single();
	}

	/** Closes an OPEN request as INVITED or DISMISSED and returns its email; empty when it is not OPEN or does not exist. */
	Optional<String> close(UUID id, String status) {
		return jdbc.sql("update access_request set status = :status, resolved_at = now() where id = :id and status = 'OPEN' returning email")
				.param("status", status).param("id", id).query(String.class).optional();
	}

	boolean exists(UUID id) {
		return jdbc.sql("select count(*) from access_request where id = :id").param("id", id).query(Long.class).single() > 0;
	}

}
