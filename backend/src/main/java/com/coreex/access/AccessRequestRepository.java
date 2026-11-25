package com.coreex.access;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class AccessRequestRepository {

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

}
