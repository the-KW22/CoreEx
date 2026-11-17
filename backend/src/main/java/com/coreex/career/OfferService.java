package com.coreex.career;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.applications.ApplicationService;
import com.coreex.career.OfferChecks.Check;
import com.coreex.common.ApiException;
import com.coreex.knowledge.KnowledgeRepository.PreferencesRow;
import com.coreex.knowledge.KnowledgeService;

/** The Offers of an Application. Every read is scoped to the User and hides Offers whose Application is in the Trash. */
@Service
public class OfferService {

	public record Offer(UUID id, UUID applicationId, OfferTerms terms, int version, Instant updatedAt, List<Check> checks) {
	}

	public record Listed(UUID applicationId, String applicationTitle, String company, String role, Offer offer) {
	}

	public record Version(int version, Instant savedAt, OfferTerms terms) {
	}

	public record Pair(Offer a, Offer b) {
	}

	private static final String COLUMNS = """
			o.id, o.item_id, o.base_pay, o.currency, o.pay_period, o.bonus, o.equity, o.benefits, o.start_date, o.place,
			o.office_days, o.respond_by, o.version, o.updated_at""";

	private final JdbcClient jdbc;

	private final ApplicationService applications;

	private final KnowledgeService knowledge;

	OfferService(JdbcClient jdbc, ApplicationService applications, KnowledgeService knowledge) {
		this.jdbc = jdbc;
		this.applications = applications;
		this.knowledge = knowledge;
	}

	private static OfferTerms terms(ResultSet rs) throws SQLException {
		return new OfferTerms(rs.getBigDecimal("base_pay"), rs.getString("currency"), rs.getString("pay_period"), rs.getString("bonus"),
				rs.getString("equity"), rs.getString("benefits"), rs.getObject("start_date", LocalDate.class), rs.getString("place"),
				(Integer) rs.getObject("office_days"), rs.getObject("respond_by", LocalDate.class));
	}

	private static Offer offer(ResultSet rs, PreferencesRow prefs) throws SQLException {
		var terms = terms(rs);
		return new Offer(rs.getObject("id", UUID.class), rs.getObject("item_id", UUID.class), terms, rs.getInt("version"),
				rs.getObject("updated_at", OffsetDateTime.class).toInstant(), OfferChecks.of(terms, prefs));
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Offer.");
	}

	private PreferencesRow prefs(UUID owner) {
		return knowledge.preferences(owner).orElse(null);
	}

	/** The Offers of one Application, newest first. */
	public List<Offer> list(UUID owner, UUID applicationId) {
		applications.get(owner, applicationId);
		var prefs = prefs(owner);
		return jdbc.sql("select " + COLUMNS + " from offers o join items i on i.id = o.item_id"
				+ " where o.owner_id = :owner and o.item_id = :app and i.deleted_at is null order by o.created_at desc, o.id")
				.param("owner", owner).param("app", applicationId).query((rs, n) -> offer(rs, prefs)).list();
	}

	/** Every Offer of the User, newest first, with the Application it belongs to. */
	public List<Listed> all(UUID owner) {
		var prefs = prefs(owner);
		return jdbc.sql("select " + COLUMNS + ", i.title as app_title, c.company, c.role from offers o"
				+ " join items i on i.id = o.item_id join application_contents c on c.item_id = i.id"
				+ " where o.owner_id = :owner and i.deleted_at is null order by o.created_at desc, o.id")
				.param("owner", owner).query((rs, n) -> new Listed(rs.getObject("item_id", UUID.class), rs.getString("app_title"),
						rs.getString("company"), rs.getString("role"), offer(rs, prefs)))
				.list();
	}

	/** The respond-by dates of the User's Offers, for Today. */
	public List<TodayLists.OfferDeadline> deadlines(UUID owner) {
		return jdbc.sql("select o.item_id, o.respond_by from offers o join items i on i.id = o.item_id"
				+ " where o.owner_id = :owner and o.respond_by is not null and i.deleted_at is null")
				.param("owner", owner).query((rs, n) -> new TodayLists.OfferDeadline(rs.getObject("item_id", UUID.class),
						rs.getObject("respond_by", LocalDate.class)))
				.list();
	}

	private Offer one(UUID owner, UUID offerId) {
		var prefs = prefs(owner);
		return jdbc.sql("select " + COLUMNS + " from offers o join items i on i.id = o.item_id"
				+ " where o.owner_id = :owner and o.id = :id and i.deleted_at is null")
				.param("owner", owner).param("id", offerId).query((rs, n) -> offer(rs, prefs)).optional()
				.orElseThrow(OfferService::notFound);
	}

	private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec s, OfferTerms t) {
		return s.param("basePay", t.basePay()).param("currency", t.currency()).param("period", t.payPeriod())
				.param("bonus", t.bonus()).param("equity", t.equity()).param("benefits", t.benefits())
				.param("start", t.startDate()).param("place", t.place()).param("days", t.officeDays())
				.param("respond", t.respondBy());
	}

	public Offer create(UUID owner, UUID applicationId, OfferTerms terms) {
		applications.get(owner, applicationId);
		var id = UUID.randomUUID();
		bind(jdbc.sql("""
				insert into offers (id, item_id, owner_id, base_pay, currency, pay_period, bonus, equity, benefits, start_date, place,
				  office_days, respond_by)
				values (:id, :app, :owner, :basePay, :currency, :period, :bonus, :equity, :benefits, :start, :place, :days, :respond)""")
				.param("id", id).param("app", applicationId).param("owner", owner), terms).update();
		return one(owner, id);
	}

	/**
	 * Replaces the terms; the terms it replaces are kept as a version first. The version the User saw must still be
	 * current (409 otherwise). The row lock taken by the copy keeps a racing edit from slipping between the two writes.
	 */
	@Transactional
	public Offer update(UUID owner, UUID offerId, OfferTerms terms, int seenVersion) {
		one(owner, offerId);
		var copied = jdbc.sql("""
				with previous as (select * from offers where id = :id and owner_id = :owner and version = :seen for update)
				insert into offer_versions (offer_id, version, owner_id, base_pay, currency, pay_period, bonus, equity, benefits,
				  start_date, place, office_days, respond_by)
				select id, version, owner_id, base_pay, currency, pay_period, bonus, equity, benefits, start_date, place,
				  office_days, respond_by from previous""")
				.param("id", offerId).param("owner", owner).param("seen", seenVersion).update();
		if (copied == 0) {
			throw new ApiException(HttpStatus.CONFLICT, "CONFLICT", "This Offer changed since you opened it. Reload and try again.");
		}
		bind(jdbc.sql("""
				update offers set base_pay = :basePay, currency = :currency, pay_period = :period, bonus = :bonus, equity = :equity,
				  benefits = :benefits, start_date = :start, place = :place, office_days = :days, respond_by = :respond,
				  version = version + 1, updated_at = now()
				where id = :id and owner_id = :owner""").param("id", offerId).param("owner", owner), terms).update();
		return one(owner, offerId);
	}

	/** Deletes an Offer that is still the version seen; false when it is gone or has changed. Undoes an Offer that an apply created. */
	@Transactional
	public boolean delete(UUID owner, UUID offerId, int seenVersion) {
		return jdbc.sql("delete from offers where id = :id and owner_id = :owner and version = :seen")
				.param("id", offerId).param("owner", owner).param("seen", seenVersion).update() > 0;
	}

	/** The earlier terms of an Offer, newest first. */
	public List<Version> versions(UUID owner, UUID offerId) {
		one(owner, offerId);
		return jdbc.sql("""
				select version, saved_at, base_pay, currency, pay_period, bonus, equity, benefits, start_date, place, office_days,
				  respond_by from offer_versions where offer_id = :id and owner_id = :owner order by version desc""")
				.param("id", offerId).param("owner", owner)
				.query((rs, n) -> new Version(rs.getInt("version"), rs.getObject("saved_at", OffsetDateTime.class).toInstant(), terms(rs)))
				.list();
	}

	/** Both Offers, when they are in the same currency and pay period; 422 otherwise. */
	public Pair compare(UUID owner, UUID a, UUID b) {
		var first = one(owner, a);
		var second = one(owner, b);
		var refusal = OfferComparison.refusal(first.terms(), second.terms());
		if (refusal.isPresent()) {
			throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "NOT_COMPARABLE", refusal.get());
		}
		return new Pair(first, second);
	}

}
