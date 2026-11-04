package com.coreex.embeddings;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.embeddings.NoteChunker.Chunk;

/**
 * Reads and writes the Chunks of Notes. The sweep works for every User, so these queries are not scoped to one User;
 * every row it writes carries its Note's owner.
 */
@Repository
class ChunkRepository {

	/** A Note as it was at one moment: its title and body, and the updated_at that moment had. */
	record Snapshot(UUID noteId, UUID ownerId, String title, String body, OffsetDateTime updatedAt) {
	}

	/** A stored Chunk, enough to tell whether it is still wanted. */
	record Stored(UUID id, String hash, String model) {
	}

	/** A Chunk to store, at its place in the Note, with its vector. */
	record Added(int position, Chunk chunk, float[] vector) {
	}

	private final JdbcClient jdbc;

	ChunkRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	/**
	 * Live Notes that have not changed for {@code settle} and whose Chunks are not current: never embedded, edited
	 * since, or holding a Chunk of another model. Oldest edit first, so none waits forever.
	 */
	List<UUID> due(Duration settle, String model, int limit) {
		return jdbc.sql("""
				select i.id from items i join note_contents c on c.item_id = i.id
				where i.type = 'NOTE' and i.deleted_at is null
				  and i.updated_at <= now() - make_interval(secs => :seconds)
				  and (c.embedded_updated_at is distinct from i.updated_at
				       or exists (select 1 from note_chunks k where k.note_id = i.id and k.model <> :model))
				order by i.updated_at, i.id limit :limit""").param("seconds", settle.toMillis() / 1000.0)
				.param("model", model).param("limit", limit).query(UUID.class).list();
	}

	/** The Note's title, body and updated_at from one statement, so they belong together; empty if it is gone. */
	Optional<Snapshot> snapshot(UUID noteId) {
		return jdbc.sql("""
				select i.id, i.owner_id, i.title, c.body, i.updated_at
				from items i join note_contents c on c.item_id = i.id
				where i.id = :id and i.type = 'NOTE' and i.deleted_at is null""").param("id", noteId)
				.query((rs, n) -> new Snapshot(rs.getObject("id", UUID.class), rs.getObject("owner_id", UUID.class),
						rs.getString("title"), rs.getString("body"), rs.getObject("updated_at", OffsetDateTime.class)))
				.optional();
	}

	List<Stored> storedFor(UUID noteId) {
		return jdbc.sql("select id, content_hash, model from note_chunks where note_id = :id").param("id", noteId)
				.query((rs, n) -> new Stored(rs.getObject("id", UUID.class), rs.getString("content_hash"),
						rs.getString("model")))
				.list();
	}

	/**
	 * Makes the Note's stored Chunks match what the sweep worked out, in one transaction: the Chunks not in
	 * {@code kept} are removed, the kept ones move to their new place ({@code kept} maps a Chunk id to its position),
	 * and the added ones are stored. Only when {@code complete} does the Note count as embedded, with the updated_at
	 * it was read at, so an edit made meanwhile still makes it due.
	 */
	@Transactional
	void replace(Snapshot note, Map<UUID, Integer> kept, List<Added> added, boolean complete) {
		if (kept.isEmpty()) {
			jdbc.sql("delete from note_chunks where note_id = :note").param("note", note.noteId()).update();
		}
		else {
			jdbc.sql("delete from note_chunks where note_id = :note and id not in (:kept)")
					.param("note", note.noteId()).param("kept", kept.keySet()).update();
		}
		kept.forEach((id, position) -> jdbc
				.sql("update note_chunks set position = :position where id = :id and position <> :position")
				.param("position", position).param("id", id).update());
		for (var chunk : added) {
			jdbc.sql("""
					insert into note_chunks (owner_id, note_id, position, content, content_hash, model, embedding)
					values (:owner, :note, :position, :content, :hash, :model, cast(:embedding as halfvec))""")
					.param("owner", note.ownerId()).param("note", note.noteId()).param("position", chunk.position())
					.param("content", chunk.chunk().text()).param("hash", chunk.chunk().hash())
					.param("model", Embedder.MODEL).param("embedding", literal(chunk.vector())).update();
		}
		if (complete) {
			jdbc.sql("update note_contents set embedded_updated_at = :at where item_id = :note")
					.param("at", note.updatedAt()).param("note", note.noteId()).update();
		}
	}

	/** pgvector's text form: {@code [0.1,0.2,...]}. */
	private static String literal(float[] vector) {
		var text = new StringBuilder("[");
		for (var i = 0; i < vector.length; i++) {
			text.append(i == 0 ? "" : ",").append(vector[i]);
		}
		return text.append(']').toString();
	}

}
