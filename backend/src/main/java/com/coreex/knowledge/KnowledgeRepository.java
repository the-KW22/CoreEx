package com.coreex.knowledge;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Every query carries the owner id. */
@Repository
class KnowledgeRepository {

	record FactRow(UUID id, String text, String category, String sourceKind, UUID sourceId, String quote, String sourceKey,
			String status, Instant updatedAt) {
	}

	record Revision(String text, Instant savedAt) {
	}

	record StoryRow(UUID id, String title, Instant updatedAt) {
	}

	record PreferencesRow(String targetRoles, List<String> places, BigDecimal minBasePay, String currency, String payPeriod,
			Integer officeDays, String noticePeriod) {
	}

	private static final String FACT = "id, text, category, source_kind, source_id, quote, source_key, status, updated_at";

	private final JdbcClient jdbc;

	KnowledgeRepository(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	private static FactRow fact(ResultSet rs) throws SQLException {
		return new FactRow(rs.getObject("id", UUID.class), rs.getString("text"), rs.getString("category"),
				rs.getString("source_kind"), rs.getObject("source_id", UUID.class), rs.getString("quote"),
				rs.getString("source_key"), rs.getString("status"), instant(rs, "updated_at"));
	}

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		return rs.getObject(column, OffsetDateTime.class).toInstant();
	}

	List<FactRow> facts(UUID ownerId, String category, String status) {
		return jdbc.sql("select " + FACT + " from facts where owner_id = :owner"
				+ " and (cast(:category as text) is null or category = :category)"
				+ " and (cast(:status as text) is null or status = :status) order by updated_at desc, id")
				.param("owner", ownerId).param("category", category).param("status", status).query((rs, n) -> fact(rs)).list();
	}

	Optional<FactRow> fact(UUID ownerId, UUID id) {
		return jdbc.sql("select " + FACT + " from facts where owner_id = :owner and id = :id").param("owner", ownerId)
				.param("id", id).query((rs, n) -> fact(rs)).optional();
	}

	List<Revision> revisions(UUID ownerId, UUID factId) {
		return jdbc.sql("select text, saved_at from fact_revisions where owner_id = :owner and fact_id = :id order by saved_at, id")
				.param("owner", ownerId).param("id", factId)
				.query((rs, n) -> new Revision(rs.getString("text"), instant(rs, "saved_at"))).list();
	}

	/** The revisions of many Facts in one query, oldest first, keyed by Fact id. */
	Map<UUID, List<Revision>> revisionsOf(UUID ownerId, List<UUID> factIds) {
		var byFact = new java.util.HashMap<UUID, List<Revision>>();
		if (factIds.isEmpty()) return byFact;
		jdbc.sql("select fact_id, text, saved_at from fact_revisions where owner_id = :owner and fact_id in (:ids) order by saved_at, id")
				.param("owner", ownerId).param("ids", factIds).query((rs, n) -> {
					byFact.computeIfAbsent(rs.getObject("fact_id", UUID.class), k -> new java.util.ArrayList<>())
							.add(new Revision(rs.getString("text"), instant(rs, "saved_at")));
					return null;
				}).list();
		return byFact;
	}

	/** Empty when a Fact with the same source key already exists. */
	Optional<UUID> insertFact(UUID ownerId, String text, String category, String sourceKind, UUID sourceId, String quote,
			String sourceKey) {
		return jdbc.sql("""
				insert into facts (owner_id, text, category, source_kind, source_id, quote, source_key)
				values (:owner, :text, :category, :kind, :sourceId, :quote, :key)
				on conflict (owner_id, source_key) where source_key is not null do nothing returning id""")
				.param("owner", ownerId).param("text", text).param("category", category).param("kind", sourceKind)
				.param("sourceId", sourceId).param("quote", quote).param("key", sourceKey).query(UUID.class).optional();
	}

	void saveRevision(UUID ownerId, UUID factId, String text) {
		jdbc.sql("insert into fact_revisions (owner_id, fact_id, text) values (:owner, :id, :text)").param("owner", ownerId)
				.param("id", factId).param("text", text).update();
	}

	void updateFact(UUID ownerId, UUID id, String text, String category) {
		jdbc.sql("update facts set text = :text, category = :category, updated_at = now() where owner_id = :owner and id = :id")
				.param("text", text).param("category", category).param("owner", ownerId).param("id", id).update();
	}

	void setStatus(UUID ownerId, UUID id, String status) {
		jdbc.sql("update facts set status = :status, updated_at = now() where owner_id = :owner and id = :id")
				.param("status", status).param("owner", ownerId).param("id", id).update();
	}

	/** Deletes the Fact; its revisions go with it through the foreign key, so their text is gone too. */
	void deleteFact(UUID ownerId, UUID id) {
		jdbc.sql("delete from facts where owner_id = :owner and id = :id").param("owner", ownerId).param("id", id).update();
	}

	void tombstone(UUID ownerId, String sourceKey) {
		jdbc.sql("insert into fact_tombstones (owner_id, source_key) values (:owner, :key) on conflict do nothing")
				.param("owner", ownerId).param("key", sourceKey).update();
	}

	boolean tombstoned(UUID ownerId, String sourceKey) {
		return jdbc.sql("select count(*) from fact_tombstones where owner_id = :owner and source_key = :key")
				.param("owner", ownerId).param("key", sourceKey).query(Long.class).single() > 0;
	}

	List<String> sourceKeys(UUID ownerId) {
		return jdbc.sql("select source_key from facts where owner_id = :owner and source_key is not null").param("owner", ownerId)
				.query(String.class).list();
	}

	/** The Resume's plain text; empty when it is missing, not the User's or in the Trash. */
	Optional<String> resumeText(UUID ownerId, UUID id) {
		return jdbc.sql("""
				select c.plain_text from resume_contents c join items i on i.id = c.item_id
				where i.owner_id = :owner and i.id = :id and i.type = 'RESUME' and i.deleted_at is null""")
				.param("owner", ownerId).param("id", id).query(String.class).optional();
	}

	/** The Note's Markdown; empty when it is missing, not the User's or in the Trash. */
	Optional<String> noteText(UUID ownerId, UUID id) {
		return jdbc.sql("""
				select c.body from note_contents c join items i on i.id = c.item_id
				where i.owner_id = :owner and i.id = :id and i.type = 'NOTE' and i.deleted_at is null""")
				.param("owner", ownerId).param("id", id).query(String.class).optional();
	}

	List<StoryRow> stories(UUID ownerId) {
		return jdbc.sql("""
				select i.id, i.title, i.updated_at from items i join note_contents c on c.item_id = i.id
				where i.owner_id = :owner and i.type = 'NOTE' and i.deleted_at is null and c.story
				order by i.updated_at desc, i.id""").param("owner", ownerId)
				.query((rs, n) -> new StoryRow(rs.getObject("id", UUID.class), rs.getString("title"), instant(rs, "updated_at")))
				.list();
	}

	/** False when the Note is missing, not the User's or in the Trash. */
	boolean setStory(UUID ownerId, UUID noteId, boolean story) {
		return jdbc.sql("""
				update note_contents c set story = :story from items i
				where c.item_id = i.id and i.id = :id and i.owner_id = :owner and i.type = 'NOTE' and i.deleted_at is null""")
				.param("story", story).param("id", noteId).param("owner", ownerId).update() > 0;
	}

	Optional<PreferencesRow> preferences(UUID ownerId) {
		return jdbc.sql("""
				select target_roles, places, min_base_pay, currency, pay_period, office_days, notice_period
				from career_preferences where owner_id = :owner""").param("owner", ownerId)
				.query((rs, n) -> new PreferencesRow(rs.getString("target_roles"),
						List.of((String[]) rs.getArray("places").getArray()), rs.getBigDecimal("min_base_pay"),
						rs.getString("currency"), rs.getString("pay_period"), (Integer) rs.getObject("office_days"),
						rs.getString("notice_period")))
				.optional();
	}

	void savePreferences(UUID ownerId, PreferencesRow p) {
		jdbc.sql("""
				insert into career_preferences (owner_id, target_roles, places, min_base_pay, currency, pay_period, office_days,
				  notice_period, updated_at)
				values (:owner, :roles, :places, :minPay, :currency, :period, :days, :notice, now())
				on conflict (owner_id) do update set target_roles = excluded.target_roles, places = excluded.places,
				  min_base_pay = excluded.min_base_pay, currency = excluded.currency, pay_period = excluded.pay_period,
				  office_days = excluded.office_days, notice_period = excluded.notice_period, updated_at = now()""")
				.param("owner", ownerId).param("roles", p.targetRoles()).param("places", p.places().toArray(String[]::new))
				.param("minPay", p.minBasePay()).param("currency", p.currency()).param("period", p.payPeriod())
				.param("days", p.officeDays()).param("notice", p.noticePeriod()).update();
	}

}
