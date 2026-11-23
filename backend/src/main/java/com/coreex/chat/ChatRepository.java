package com.coreex.chat;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.coreex.ai.Model;
import com.coreex.ai.Model.ContentBlock;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectWriter;
import tools.jackson.databind.json.JsonMapper;

/** Every query carries the owner id, or works on a Chat or message the service has already found as the owner's. */
@Repository
class ChatRepository {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final TypeReference<List<ContentBlock>> BLOCKS = new TypeReference<>() {
	};

	private static final TypeReference<List<Quote>> QUOTES = new TypeReference<>() {
	};

	// Written against the declared type, so each block keeps its "type" field (a plain list loses it).
	private static final ObjectWriter BLOCKS_WRITER = JSON.writerFor(BLOCKS);

	private static final ObjectWriter QUOTES_WRITER = JSON.writerFor(QUOTES);

	private static final TypeReference<List<Model.WebSource>> WEB = new TypeReference<>() {
	};

	private static final ObjectWriter WEB_WRITER = JSON.writerFor(WEB);

	private static final RowMapper<Chat> CHAT = (rs, n) -> new Chat(rs.getObject("id", UUID.class),
			rs.getString("title"), rs.getObject("created_at", OffsetDateTime.class).toInstant(),
			rs.getObject("last_used_at", OffsetDateTime.class).toInstant(), rs.getBoolean("use_notes"));

	private static final RowMapper<ChatMessage> MESSAGE = (rs, n) -> new ChatMessage(rs.getObject("id", UUID.class),
			Model.Role.valueOf(rs.getString("role")), JSON.readValue(rs.getString("content"), BLOCKS),
			rs.getString("status"), rs.getString("error_code"),
			rs.getString("quotes") == null ? List.of() : JSON.readValue(rs.getString("quotes"), QUOTES),
			rs.getObject("created_at", OffsetDateTime.class).toInstant(),
			rs.getString("web_sources") == null ? List.of() : JSON.readValue(rs.getString("web_sources"), WEB));

	private final JdbcClient jdbc;

	ChatRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	List<Chat> list(UUID owner) {
		return jdbc.sql("select id, title, created_at, last_used_at, use_notes from chats where owner_id = :owner order by last_used_at desc, id")
				.param("owner", owner).query(CHAT).list();
	}

	Optional<Chat> find(UUID owner, UUID id) {
		return jdbc.sql("select id, title, created_at, last_used_at, use_notes from chats where id = :id and owner_id = :owner")
				.param("id", id).param("owner", owner).query(CHAT).optional();
	}

	Chat create(UUID owner, Instant now) {
		return jdbc.sql("insert into chats (owner_id, created_at, last_used_at) values (:owner, :now, :now) returning id, title, created_at, last_used_at, use_notes")
				.param("owner", owner).param("now", Timestamp.from(now)).query(CHAT).single();
	}

	boolean delete(UUID owner, UUID id) {
		return jdbc.sql("delete from chats where id = :id and owner_id = :owner").param("id", id).param("owner", owner)
				.update() == 1;
	}

	/** Takes the reply's claim unless a reply holds one that is not yet stale. */
	boolean claim(UUID owner, UUID id, Instant now, Instant staleBefore) {
		return jdbc.sql("""
				update chats set claimed_at = :now
				where id = :id and owner_id = :owner and (claimed_at is null or claimed_at < :stale)""")
				.param("now", Timestamp.from(now)).param("id", id).param("owner", owner).param("stale", Timestamp.from(staleBefore)).update() == 1;
	}

	/** Frees the claim only if it is still the one taken at {@code claimedAt}: a late release never frees a newer claim. */
	void release(UUID id, Instant claimedAt) {
		jdbc.sql("update chats set claimed_at = null where id = :id and claimed_at = :claimedAt")
				.param("id", id).param("claimedAt", Timestamp.from(claimedAt)).update();
	}

	void touch(UUID id, Instant now) {
		jdbc.sql("update chats set last_used_at = :now where id = :id").param("now", Timestamp.from(now)).param("id", id).update();
	}

	void setTitle(UUID id, String title) {
		jdbc.sql("update chats set title = :title where id = :id").param("title", title).param("id", id).update();
	}

	void setUseNotes(UUID id, boolean useNotes) {
		jdbc.sql("update chats set use_notes = :useNotes where id = :id").param("useNotes", useNotes).param("id", id).update();
	}

	boolean hasMessages(UUID chatId) {
		return jdbc.sql("select exists (select 1 from chat_messages where chat_id = :chat)").param("chat", chatId)
				.query(Boolean.class).single();
	}

	/** Appends a message at the next position of the Chat. The quotes are stored as null when there are none. */
	UUID addMessage(UUID chatId, Model.Role role, List<ContentBlock> blocks, String status, String errorCode,
			List<Quote> quotes, Instant now) {
		return jdbc.sql("""
				insert into chat_messages (id, chat_id, position, role, content, status, error_code, quotes, created_at)
				values (gen_random_uuid(), :chat, (select coalesce(max(position), 0) + 1 from chat_messages where chat_id = :chat),
				        :role, cast(:content as jsonb), :status, :error, cast(:quotes as jsonb), :now)
				returning id""")
				.param("chat", chatId).param("role", role.name()).param("content", BLOCKS_WRITER.writeValueAsString(blocks))
				.param("status", status).param("error", errorCode)
				.param("quotes", quotes.isEmpty() ? null : QUOTES_WRITER.writeValueAsString(quotes))
				.param("now", Timestamp.from(now)).query(UUID.class).single();
	}

	void setMessage(UUID id, List<ContentBlock> blocks, String status, String errorCode) {
		jdbc.sql("update chat_messages set content = cast(:content as jsonb), status = :status, error_code = :error where id = :id")
				.param("content", BLOCKS_WRITER.writeValueAsString(blocks)).param("status", status).param("error", errorCode)
				.param("id", id).update();
	}

	/** Marks messages a earlier run left streaming as failed: no reply is behind them any more. */
	void failStreaming(UUID chatId) {
		jdbc.sql("update chat_messages set status = 'FAILED', error_code = 'AI_UNAVAILABLE' where chat_id = :chat and status = 'STREAMING'")
				.param("chat", chatId).update();
	}

	/** The web pages an assistant message retrieved; the caller has kept only the http and https ones. */
	void setWebSources(UUID id, List<Model.WebSource> sources) {
		jdbc.sql("update chat_messages set web_sources = cast(:sources as jsonb) where id = :id")
				.param("sources", WEB_WRITER.writeValueAsString(sources)).param("id", id).update();
	}

	void deleteMessage(UUID id) {
		jdbc.sql("delete from chat_messages where id = :id").param("id", id).update();
	}

	List<ChatMessage> messages(UUID chatId) {
		return jdbc.sql("""
				select id, role, content::text as content, quotes::text as quotes, status, error_code, created_at,
				       web_sources::text as web_sources
				from chat_messages where chat_id = :chat order by position""")
				.param("chat", chatId).query(MESSAGE).list();
	}

}
