package com.coreex.identity;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class UserRepository {

	private final JdbcClient jdbc;

	UserRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	Optional<User> findById(UUID id) {
		return jdbc.sql("select id, email, role, status from users where id = :id").param("id", id)
				.query((rs, n) -> new User(rs.getObject("id", UUID.class), rs.getString("email"),
						User.Role.valueOf(rs.getString("role")), User.Status.valueOf(rs.getString("status"))))
				.optional();
	}

	/** Does nothing if two first requests race; the loser then reads the winner's row. */
	void insert(User user) {
		jdbc.sql("insert into users (id, email, role, status) values (:id, :email, :role, :status) on conflict (id) do nothing")
				.param("id", user.id()).param("email", user.email()).param("role", user.role().name())
				.param("status", user.status().name()).update();
	}

	/** Turns the email's PENDING Invite into ACCEPTED. False when there is none. */
	boolean acceptPendingInvite(String email, Instant now) {
		return jdbc.sql("update invites set status = 'ACCEPTED', accepted_at = :now where email = :email and status = 'PENDING'")
				.param("now", Timestamp.from(now)).param("email", email).update() > 0;
	}

	void touchLastActive(UUID id, Instant now, Instant staleBefore) {
		jdbc.sql("update users set last_active_at = :now where id = :id and (last_active_at is null or last_active_at <= :staleBefore)")
				.param("now", Timestamp.from(now)).param("id", id).param("staleBefore", Timestamp.from(staleBefore))
				.update();
	}

}
