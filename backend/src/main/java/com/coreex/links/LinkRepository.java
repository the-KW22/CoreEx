package com.coreex.links;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.coreex.items.Item;

@Repository
class LinkRepository {

	record Backlink(UUID id, String title) {
	}

	record GraphItem(UUID id, Item.Type type, String title, UUID folderId, boolean stub) {
	}

	record GraphEdge(UUID source, UUID target) {
	}

	/**
	 * The live Items in scope (all of the User's, or those in the given Folders), and the Links touching them whose
	 * both ends are live Items of the User.
	 */
	private static String scope(List<UUID> folderIds) {
		return """
				with scope as (select id from items where owner_id = :owner and deleted_at is null %s),
				edge as (
				  select l.source_id, l.target_id from links l
				  join items s on s.id = l.source_id and s.owner_id = :owner and s.deleted_at is null
				  join items t on t.id = l.target_id and t.owner_id = :owner and t.deleted_at is null
				  where l.source_id in (select id from scope) or l.target_id in (select id from scope))
				""".formatted(folderIds == null ? "" : "and folder_id in (:folders)");
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

	/** Every Item in scope, plus the outside Items linked to or from them (as stubs). */
	List<GraphItem> graphItems(UUID ownerId, List<UUID> folderIds) {
		var sql = jdbc.sql(scope(folderIds) + """
				select i.id, i.type, i.title, i.folder_id, i.id not in (select id from scope) as stub from items i
				where i.id in (select id from scope union select source_id from edge union select target_id from edge)
				""").param("owner", ownerId);
		return (folderIds == null ? sql : sql.param("folders", folderIds))
				.query((rs, n) -> new GraphItem(rs.getObject("id", UUID.class), Item.Type.valueOf(rs.getString("type")),
						rs.getString("title"), rs.getObject("folder_id", UUID.class), rs.getBoolean("stub")))
				.list();
	}

	List<GraphEdge> graphEdges(UUID ownerId, List<UUID> folderIds) {
		var sql = jdbc.sql(scope(folderIds) + "select source_id, target_id from edge").param("owner", ownerId);
		return (folderIds == null ? sql : sql.param("folders", folderIds))
				.query((rs, n) -> new GraphEdge(rs.getObject("source_id", UUID.class),
						rs.getObject("target_id", UUID.class)))
				.list();
	}

}
