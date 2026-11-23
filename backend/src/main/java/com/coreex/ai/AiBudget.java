package com.coreex.ai;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import com.coreex.common.ApiException;

/**
 * The Daily AI budget (ADR 0009), per User, in money and not tokens, starting again at midnight UTC. A call that
 * crosses the line finishes and is counted; the next one is refused. Chat and every Career AI action draw on it.
 */
@Component
public class AiBudget {

	static final String SPENT = "AI_BUDGET_SPENT";

	private final JdbcClient jdbc;

	private final Clock clock;

	private final AiSettings settings;

	AiBudget(JdbcClient jdbc, Clock clock, AiSettings settings) {
		this.jdbc = jdbc;
		this.clock = clock;
		this.settings = settings;
	}

	private LocalDate today() {
		return clock.instant().atZone(ZoneOffset.UTC).toLocalDate();
	}

	/** When the budget starts again: the next midnight UTC. */
	Instant resetsAt() {
		return today().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
	}

	/** The Daily AI budget an Admin set (or the default), in millionths of a dollar. */
	long budgetMicroUsd() {
		return settings.current().dailyBudgetMicroUsd();
	}

	long spentToday(UUID ownerId) {
		return jdbc.sql("select coalesce(sum(micro_usd), 0) from ai_usage where owner_id = :owner and day = :day")
				.param("owner", ownerId).param("day", today()).query(Long.class).single();
	}

	/** Refuses with the one answer Chat uses too when today's budget is used up. */
	void requireRoom(UUID ownerId) {
		if (spentToday(ownerId) >= budgetMicroUsd()) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, SPENT,
					"You have used today's AI budget. It starts again at midnight UTC.");
		}
	}

	void record(UUID ownerId, long microUsd) {
		jdbc.sql("""
				insert into ai_usage (owner_id, day, micro_usd) values (:owner, :day, :micro)
				on conflict (owner_id, day) do update set micro_usd = ai_usage.micro_usd + excluded.micro_usd""")
				.param("owner", ownerId).param("day", today()).param("micro", Math.max(0, microUsd)).update();
	}

}
