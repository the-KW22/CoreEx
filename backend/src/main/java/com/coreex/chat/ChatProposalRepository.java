package com.coreex.chat;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Proposals of a Chat. Callers have already found the Chat as the owner's; every query is by that Chat. */
@Repository
class ChatProposalRepository {

	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final TypeReference<Map<String, Object>> INPUT = new TypeReference<>() {
	};

	private static final RowMapper<Proposal> PROPOSAL = (rs, n) -> new Proposal(rs.getObject("id", UUID.class),
			rs.getObject("chat_id", UUID.class), rs.getObject("message_id", UUID.class), rs.getObject("batch_id", UUID.class),
			rs.getString("tool_use_id"), rs.getString("tool"), rs.getString("label"),
			JSON.readValue(rs.getString("input"), INPUT), rs.getObject("target_id", UUID.class), rs.getString("before_text"),
			rs.getString("after_text"), rs.getString("status"), rs.getString("result"),
			rs.getObject("created_at", OffsetDateTime.class).toInstant());

	private static final String COLUMNS = """
			id, chat_id, message_id, batch_id, tool_use_id, tool, label, input::text as input, target_id, before_text,
			after_text, status, result, created_at""";

	private final JdbcClient jdbc;

	ChatProposalRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	void add(UUID chatId, UUID messageId, UUID batchId, String toolUseId, String tool, String label, Map<String, Object> input,
			UUID targetId, String before, String after, Instant now) {
		jdbc.sql("""
				insert into chat_proposals (chat_id, message_id, batch_id, tool_use_id, tool, label, input, target_id,
				                            before_text, after_text, created_at)
				values (:chat, :message, :batch, :use, :tool, :label, cast(:input as jsonb), :target, :before, :after, :now)""")
				.param("chat", chatId).param("message", messageId).param("batch", batchId).param("use", toolUseId)
				.param("tool", tool).param("label", label).param("input", JSON.writeValueAsString(input))
				.param("target", targetId).param("before", before).param("after", after).param("now", Timestamp.from(now))
				.update();
	}

	List<Proposal> list(UUID chatId) {
		return jdbc.sql("select " + COLUMNS + " from chat_proposals where chat_id = :chat order by seq")
				.param("chat", chatId).query(PROPOSAL).list();
	}

	Optional<Proposal> find(UUID chatId, UUID id) {
		return jdbc.sql("select " + COLUMNS + " from chat_proposals where chat_id = :chat and id = :id").param("chat", chatId)
				.param("id", id).query(PROPOSAL).optional();
	}

	/**
	 * Records the answer, only while the Proposal is still PENDING; false when somebody answered it first. The Note texts
	 * of the diff are dropped: they matter only while the User decides, and a Note can be a megabyte.
	 */
	boolean answer(UUID id, String status, String result, Instant now) {
		return jdbc.sql("""
				update chat_proposals set status = :status, result = :result, answered_at = :now, before_text = null,
				after_text = null where id = :id and status = 'PENDING'""").param("status", status).param("result", result)
				.param("now", Timestamp.from(now)).param("id", id).update() == 1;
	}

	/** Marks the Chat's pending Proposals for this Note as replaced and returns them (the new one takes their place). */
	List<Proposal> replacePending(UUID chatId, UUID targetId, Instant now) {
		return jdbc.sql("""
				update chat_proposals set status = 'REPLACED', answered_at = :now, before_text = null, after_text = null
				where chat_id = :chat and target_id = :target and status = 'PENDING'
				""" + " returning " + COLUMNS).param("now", Timestamp.from(now)).param("chat", chatId).param("target", targetId)
				.query(PROPOSAL).list();
	}

}
