package com.coreex.search;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.items.Item;

/**
 * Read-only queries over the User's live Items. Search reads the tables of items, notes, assets and tags directly: a
 * search is one query across all of them, so going through each feature's service would mean one query per Item.
 * Every query is scoped to the owner and to live Items.
 */
@Repository
class SearchRepository {

	record Hit(UUID id, Item.Type type, String title, UUID folderId, Instant updatedAt, String headline) {
	}

	record Quick(UUID id, Item.Type type, String title, UUID folderId) {
	}

	record NoteText(UUID id, String title, int version, String body) {
	}

	record SimilarNotes(UUID source, UUID target, double distance) {
	}

	/** The query text as a tsquery, written once so every part of the statement shares it. */
	private static final String QUERY = "with query as (select websearch_to_tsquery('simple', search_text(:q)) as tsq) ";

	// An Item matches by its title, Note body, Asset description, Application text, or the name of one of its Tags.
	private static final String FROM_WHERE = """
			from items i
			left join note_contents c on c.item_id = i.id
			left join asset_files a on a.item_id = i.id
			left join application_contents p on p.item_id = i.id
			left join resume_contents r on r.item_id = i.id
			left join cover_letter_contents l on l.item_id = i.id
			cross join query
			where i.owner_id = :owner and i.deleted_at is null
			  and (i.title_tsv @@ query.tsq or c.body_tsv @@ query.tsq or a.description_tsv @@ query.tsq
			       or p.plain_tsv @@ query.tsq or r.plain_tsv @@ query.tsq or l.plain_tsv @@ query.tsq or l.sender_tsv @@ query.tsq
			       or exists (select 1 from item_tags it join tags t on t.id = it.tag_id
			                  where it.item_id = i.id and to_tsvector('simple', search_text(t.name)) @@ query.tsq))""";

	// A title match counts most, then the Note body or Application text, then an Asset description.
	private static final String RANK = """
			coalesce(ts_rank(i.title_tsv, query.tsq), 0) * 4 + coalesce(ts_rank(c.body_tsv, query.tsq), 0)
			      + coalesce(ts_rank(p.plain_tsv, query.tsq), 0) + coalesce(ts_rank(r.plain_tsv, query.tsq), 0) + coalesce(ts_rank(l.plain_tsv, query.tsq), 0) + coalesce(ts_rank(l.sender_tsv, query.tsq), 0) + coalesce(ts_rank(a.description_tsv, query.tsq), 0) * 2""";

	private static final RowMapper<Quick> QUICK = (rs, n) -> new Quick(rs.getObject("id", UUID.class),
			Item.Type.valueOf(rs.getString("type")), rs.getString("title"), rs.getObject("folder_id", UUID.class));

	private final JdbcClient jdbc;

	SearchRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * One page of matches, best first (a title match counts most), with a headline of the first place that matched.
	 * {@code ts_headline} does not escape what it quotes, so the match markers are two control characters that
	 * {@code SearchService} turns into data; control characters in the quoted text are removed first.
	 */
	List<Hit> search(UUID ownerId, String text, Item.Type type, UUID tagId, List<UUID> folderIds, int limit,
			long offset) {
		return search(ownerId, text, type, tagId, folderIds, limit, offset, null);
	}

	/** The same, but only among the Items with these ids (the page of a merged list), when {@code onlyIds} is given. */
	List<Hit> search(UUID ownerId, String text, Item.Type type, UUID tagId, List<UUID> folderIds, int limit,
			long offset, List<UUID> onlyIds) {
		var params = params(ownerId, text, type, tagId, folderIds);
		params.put("limit", limit);
		params.put("offset", offset);
		if (onlyIds != null) {
			params.put("ids", onlyIds.toArray(new UUID[0]));
		}
		return jdbc.sql(QUERY + """
				select m.id, m.type, m.title, m.folder_id, m.updated_at,
				  ts_headline('simple', translate(m.source, chr(2) || chr(3), ''), query.tsq,
				    'StartSel=' || chr(2) || ', StopSel=' || chr(3)
				    || ', MaxWords=30, MinWords=12, MaxFragments=1, ShortWord=1') as headline
				from (
				  select i.id, i.type, i.title, i.folder_id, i.updated_at,
				    %s as rank,
				    case when c.body_tsv @@ query.tsq then left(c.body, 200000)
				         when p.plain_tsv @@ query.tsq then left(p.plain_text, 200000)
				         when r.plain_tsv @@ query.tsq then left(r.plain_text, 200000)
				         when l.plain_tsv @@ query.tsq then left(l.plain_text, 200000)
				         when l.sender_tsv @@ query.tsq then concat_ws(' ', l.document->'sender'->>'name', l.document->'sender'->>'headline', l.document->'sender'->>'email', l.document->'sender'->>'phone', l.document->'sender'->>'location', l.document->'sender'->>'website')
				         when a.description_tsv @@ query.tsq then a.description
				         when i.title_tsv @@ query.tsq then i.title
				         else (select string_agg(t.name, ', ') from item_tags it join tags t on t.id = it.tag_id
				               where it.item_id = i.id) end as source
				  """.formatted(RANK) + FROM_WHERE + filters(type, tagId, folderIds)
				+ (onlyIds == null ? "" : " and i.id = any(:ids)") + """

				  order by rank desc, i.updated_at desc, i.id
				  limit :limit offset :offset) m
				cross join query
				order by m.rank desc, m.updated_at desc, m.id""").params(params)
				.query((rs, n) -> new Hit(rs.getObject("id", UUID.class), Item.Type.valueOf(rs.getString("type")),
						rs.getString("title"), rs.getObject("folder_id", UUID.class),
						rs.getObject("updated_at", OffsetDateTime.class).toInstant(), rs.getString("headline")))
				.list();
	}

	/**
	 * For each of these Notes, the closest others among them. A Note is compared by the middle of its Chunks against each
	 * other Note's closest Chunk. Notes without Chunks have no answer.
	 */
	@Transactional(readOnly = true)
	List<SimilarNotes> similarNotes(UUID ownerId, List<UUID> noteIds, int perNote, int chunks, double maxDistance) {
		jdbc.sql("select set_config('hnsw.iterative_scan', 'relaxed_order', true)").query(String.class).single();
		return jdbc.sql("""
				select v.note_id as source, near.note_id as target, near.distance
				from (select note_id, avg(embedding) as centre from note_chunks
				      where owner_id = :owner and note_id = any(:ids) group by note_id) v
				cross join lateral (
				  select n.note_id, min(n.distance) as distance
				  from (select k.note_id, k.embedding <=> v.centre as distance
				        from note_chunks k join items i on i.id = k.note_id and i.deleted_at is null
				        where k.owner_id = :owner and k.note_id = any(:ids) and k.note_id <> v.note_id
				        order by k.embedding <=> v.centre limit :chunks) n
				  group by n.note_id order by distance limit :perNote) near
				where near.distance <= :maxDistance""").param("owner", ownerId).param("ids", noteIds.toArray(new UUID[0]))
				.param("perNote", perNote).param("chunks", chunks).param("maxDistance", maxDistance)
				.query((rs, n) -> new SimilarNotes(rs.getObject("source", UUID.class), rs.getObject("target", UUID.class),
						rs.getDouble("distance")))
				.list();
	}

	/**
	 * The User's live Notes, most recently updated first, whose text has this phrase as words and that are not this Item
	 * and do not link to it already. A first filter only: the words may be punctuated differently.
	 */
	List<NoteText> notesWithPhrase(UUID ownerId, UUID itemId, String phrase, int limit) {
		return jdbc.sql("""
				select i.id, i.title, c.version, c.body from items i join note_contents c on c.item_id = i.id
				where i.owner_id = :owner and i.deleted_at is null and i.id <> :item
				  and c.body_tsv @@ phraseto_tsquery('simple', search_text(:phrase))
				  and not exists (select 1 from links l where l.source_id = i.id and l.target_id = :item)
				order by i.updated_at desc, i.id limit :limit""").param("owner", ownerId).param("item", itemId)
				.param("phrase", phrase).param("limit", limit)
				.query((rs, n) -> new NoteText(rs.getObject("id", UUID.class), rs.getString("title"), rs.getInt("version"),
						rs.getString("body")))
				.list();
	}

	/** The ids of the best exact-word matches, best first: the same order as {@link #search}, without the snippets. */
	List<UUID> rankedIds(UUID ownerId, String text, Item.Type type, UUID tagId, List<UUID> folderIds, int limit) {
		var params = params(ownerId, text, type, tagId, folderIds);
		params.put("limit", limit);
		return jdbc.sql(QUERY + "select i.id " + FROM_WHERE + filters(type, tagId, folderIds) + " order by " + RANK
				+ " desc, i.updated_at desc, i.id limit :limit").params(params).query(UUID.class).list();
	}

	/** A Note found by meaning: the Note, and the text of its closest Chunk. */
	record Near(UUID id, Item.Type type, String title, UUID folderId, Instant updatedAt, String content) {
	}

	/**
	 * The User's live Notes whose Chunks are closest to the vector, closest first, one entry per Note with its closest
	 * Chunk, and none farther than {@code maxDistance} (cosine distance). Looks at the {@code chunks} closest Chunks.
	 * pgvector's iterative scan keeps the index going until the owner and live-Note conditions are met, so Chunks of
	 * other Users and of Notes in the Trash cannot use up the answer. Must run in a transaction: the setting is local.
	 */
	@Transactional(readOnly = true)
	List<Near> nearest(UUID ownerId, String vector, Item.Type type, UUID tagId, List<UUID> folderIds,
			double maxDistance, int chunks, int limit) {
		jdbc.sql("select set_config('hnsw.iterative_scan', 'relaxed_order', true)").query(String.class).single();
		var params = params(ownerId, "", type, tagId, folderIds);
		params.put("vector", vector);
		params.put("maxDistance", maxDistance);
		params.put("chunks", chunks);
		params.put("limit", limit);
		return jdbc.sql("""
				select hit.id, hit.type, hit.title, hit.folder_id, hit.updated_at, best.content
				from (
				  select distinct on (near.note_id) near.note_id, near.content, near.distance
				  from (
				    select k.note_id, k.content, k.embedding <=> cast(:vector as halfvec) as distance
				    from note_chunks k
				    where k.owner_id = :owner
				      and exists (select 1 from items i where i.id = k.note_id and i.deleted_at is null"""
				+ filters(type, tagId, folderIds) + """
				)
				    order by k.embedding <=> cast(:vector as halfvec)
				    limit :chunks) near
				  where near.distance <= :maxDistance
				  order by near.note_id, near.distance) best
				join items hit on hit.id = best.note_id
				order by best.distance, hit.updated_at desc, hit.id
				limit :limit""").params(params)
				.query((rs, n) -> new Near(rs.getObject("id", UUID.class), Item.Type.valueOf(rs.getString("type")),
						rs.getString("title"), rs.getObject("folder_id", UUID.class),
						rs.getObject("updated_at", OffsetDateTime.class).toInstant(), rs.getString("content")))
				.list();
	}

	long count(UUID ownerId, String text, Item.Type type, UUID tagId, List<UUID> folderIds) {
		return jdbc.sql(QUERY + "select count(*) " + FROM_WHERE + filters(type, tagId, folderIds))
				.params(params(ownerId, text, type, tagId, folderIds)).query(Long.class).single();
	}

	// shortcut: the tsvector columns are not GIN-indexed. This query is scoped to one User first and ORs across four
	// tables, which a GIN index cannot serve; add the indexes and restructure it as a union when one User's data is large.
	private static String filters(Item.Type type, UUID tagId, List<UUID> folderIds) {
		return (type == null ? "" : " and i.type = :type")
				+ (tagId == null ? "" : " and exists (select 1 from item_tags f where f.item_id = i.id and f.tag_id = :tag)")
				+ (folderIds == null ? "" : " and i.folder_id = any(:folders)");
	}

	private static Map<String, Object> params(UUID ownerId, String text, Item.Type type, UUID tagId,
			List<UUID> folderIds) {
		var params = new HashMap<String, Object>();
		params.put("q", text);
		params.put("owner", ownerId);
		if (type != null) {
			params.put("type", type.name());
		}
		if (tagId != null) {
			params.put("tag", tagId);
		}
		if (folderIds != null) {
			params.put("folders", folderIds.toArray(new UUID[0]));
		}
		return params;
	}

	/**
	 * Titles that start with the text, or are close to it by trigram word similarity (so a typo still finds the
	 * Item), prefix matches first. Must run in a transaction: the similarity threshold is set for that transaction.
	 */
	List<Quick> quick(UUID ownerId, String text, int limit) {
		jdbc.sql("select set_config('pg_trgm.word_similarity_threshold', '0.45', true)").query(String.class).single();
		var prefix = escapeLike(text) + "%";
		return jdbc.sql("""
				select i.id, i.type, i.title, i.folder_id from items i
				where i.owner_id = :owner and i.deleted_at is null and i.title <> ''
				  and (i.title ilike :prefix escape '\\' or :q <% i.title)
				order by (case when i.title ilike :prefix escape '\\' then 0 else 1 end),
				         word_similarity(:q, i.title) desc, i.updated_at desc, i.id
				limit :limit""").param("owner", ownerId).param("prefix", prefix).param("q", text).param("limit", limit)
				.query(QUICK).list();
	}

	/** The Items the User opened most recently. */
	List<Quick> recentlyOpened(UUID ownerId, int limit) {
		return jdbc.sql("""
				select id, type, title, folder_id from items
				where owner_id = :owner and deleted_at is null and last_opened_at is not null
				order by last_opened_at desc, id limit :limit""").param("owner", ownerId).param("limit", limit)
				.query(QUICK).list();
	}

	List<Quick> recentlyUpdated(UUID ownerId, int limit) {
		return jdbc.sql("""
				select id, type, title, folder_id from items
				where owner_id = :owner and deleted_at is null
				order by updated_at desc, id limit :limit""").param("owner", ownerId).param("limit", limit)
				.query(QUICK).list();
	}

	// "%" and "_" are plain characters in what the User typed, not LIKE wildcards.
	private static String escapeLike(String text) {
		return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
	}

}
