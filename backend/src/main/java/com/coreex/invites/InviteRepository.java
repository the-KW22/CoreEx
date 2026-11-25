package com.coreex.invites;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class InviteRepository {

	private static final String COLUMNS = "id, email, status, created_at, accepted_at";

	private static final RowMapper<Invite> MAPPER = (rs, n) -> {
		var accepted = rs.getObject("accepted_at", OffsetDateTime.class);
		return new Invite(rs.getObject("id", UUID.class), rs.getString("email"),
				Invite.Status.valueOf(rs.getString("status")),
				rs.getObject("created_at", OffsetDateTime.class).toInstant(),
				accepted == null ? null : accepted.toInstant());
	};

	private final JdbcClient jdbc;

	InviteRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Throws DuplicateKeyException when the email already has a PENDING Invite. */
	Invite insert(String email) {
		return jdbc.sql("insert into invites (email) values (:email) returning " + COLUMNS).param("email", email)
				.query(MAPPER).single();
	}

	/** Like insert, but does nothing (and raises no error, which would abort a surrounding transaction) when the email already has a PENDING Invite. */
	void insertUnlessPending(String email) {
		jdbc.sql("insert into invites (email) values (:email) on conflict (email) where status = 'PENDING' do nothing")
				.param("email", email).update();
	}

	List<Invite> findPage(int limit, long offset) {
		return jdbc.sql("select " + COLUMNS + " from invites order by created_at desc, id limit :limit offset :offset")
				.param("limit", limit).param("offset", offset).query(MAPPER).list();
	}

	long count() {
		return jdbc.sql("select count(*) from invites").query(Long.class).single();
	}

	Optional<Invite> findById(UUID id) {
		return jdbc.sql("select " + COLUMNS + " from invites where id = :id").param("id", id).query(MAPPER).optional();
	}

	/** False when the Invite does not exist or is not PENDING. */
	boolean revokePending(UUID id) {
		return jdbc.sql("update invites set status = 'REVOKED' where id = :id and status = 'PENDING'").param("id", id)
				.update() > 0;
	}

}
