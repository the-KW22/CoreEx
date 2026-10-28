package com.coreex.links;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class LinkRepository {

	record Backlink(UUID id, String title) {
	}

	private final JdbcClient jdbc;

	LinkRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/** Makes the Note's rows exactly these targets (id to display text), dropping any it had before. */
	void replace(UUID sourceId, LinkedHashMap<UUID, String> targets) {
		jdbc.sql("delete from links where source_id = :source").param("source", sourceId).update();
		if (targets.isEmpty()) {
			return;
		}
		var sql = new StringBuilder("insert into links (source_id, target_id, text) values ");
		var params = new LinkedHashMap<String, Object>();
		params.put("source", sourceId);
		var n = 0;
		for (var target : targets.entrySet()) {
			sql.append(n == 0 ? "" : ", ").append("(:source, :t").append(n).append(", :x").append(n).append(')');
			params.put("t" + n, target.getKey());
			params.put("x" + n, target.getValue());
			n++;
		}
		jdbc.sql(sql.toString()).params(params).update();
	}

	/**
	 * The User's live Notes that link to this Item, most recently updated first. It reads items directly: the
	 * owner and live checks on the linking Note are what keep other Users' Notes out.
	 */
	List<Backlink> backlinks(UUID ownerId, UUID targetId, int limit) {
		return jdbc.sql("""
				select src.id, src.title from links l join items src on src.id = l.source_id
				where l.target_id = :target and src.owner_id = :owner and src.deleted_at is null
				order by src.updated_at desc, src.id limit :limit""").param("target", targetId)
				.param("owner", ownerId).param("limit", limit)
				.query((rs, n) -> new Backlink(rs.getObject("id", UUID.class), rs.getString("title"))).list();
	}

}
