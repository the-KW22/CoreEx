package com.coreex.admin;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.coreex.identity.User;

/**
 * What the Admin may see about Users: account facts and totals, computed with {@code count} and {@code sum} only.
 * Nothing here selects the text of an Item, a Folder or a Tag, or a storage key (ADR 0004), so no admin endpoint can
 * return content however it is built on top of this.
 */
@Repository
class AdminUserRepository {

	record Row(UUID id, String email, User.Role role, User.Status status, Instant createdAt, Instant lastActiveAt,
			Long quotaOverride, long itemCount, long usedBytes) {
	}

	record Totals(long users, long disabledUsers, long usedBytes) {
	}

	// Items counted are the live ones; storage used is every READY Asset including those in the Trash, because their
	// files still occupy Storage (the same number the quota check uses).
	private static final String SELECT = """
			select u.id, u.email, u.role, u.status, u.created_at, u.last_active_at, u.storage_quota_bytes,
			  (select count(*) from items i where i.owner_id = u.id and i.deleted_at is null) as item_count,
			  (select coalesce(sum(f.size_bytes), 0) from asset_files f join items i on i.id = f.item_id
			   where i.owner_id = u.id) as used_bytes
			from users u""";

	private static final RowMapper<Row> MAPPER = (rs, n) -> {
		var lastActive = rs.getObject("last_active_at", OffsetDateTime.class);
		return new Row(rs.getObject("id", UUID.class), rs.getString("email"), User.Role.valueOf(rs.getString("role")),
				User.Status.valueOf(rs.getString("status")), rs.getObject("created_at", OffsetDateTime.class).toInstant(),
				lastActive == null ? null : lastActive.toInstant(), rs.getObject("storage_quota_bytes", Long.class),
				rs.getLong("item_count"), rs.getLong("used_bytes"));
	};

	private final JdbcClient jdbc;

	AdminUserRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	List<Row> page(int limit, long offset) {
		return jdbc.sql(SELECT + " order by u.created_at desc, u.id limit :limit offset :offset").param("limit", limit)
				.param("offset", offset).query(MAPPER).list();
	}

	long count() {
		return jdbc.sql("select count(*) from users").query(Long.class).single();
	}

	Optional<Row> find(UUID id) {
		return jdbc.sql(SELECT + " where u.id = :id").param("id", id).query(MAPPER).optional();
	}

	/** Null means "the configured default". False when there is no such User. */
	boolean setQuota(UUID id, Long bytes) {
		return jdbc.sql("update users set storage_quota_bytes = :bytes where id = :id").param("bytes", bytes)
				.param("id", id).update() > 0;
	}

	/** False when there is no such User. */
	boolean setStatus(UUID id, User.Status status) {
		return jdbc.sql("update users set status = :status where id = :id").param("status", status.name())
				.param("id", id).update() > 0;
	}

	/** Removes the User; their Items, Folders, Tags and uploads go with them (on delete cascade). */
	void delete(UUID id) {
		jdbc.sql("delete from users where id = :id").param("id", id).update();
	}

	Totals totals() {
		var users = jdbc.sql("select count(*), count(*) filter (where status = 'DISABLED') from users")
				.query((rs, n) -> new long[] { rs.getLong(1), rs.getLong(2) }).single();
		var used = jdbc.sql("select coalesce(sum(size_bytes), 0) from asset_files").query(Long.class).single();
		return new Totals(users[0], users[1], used);
	}

}
