package com.coreex.career;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;
import com.coreex.TestSupportConfiguration.TestClock;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class CareerTodayApiTest extends ApiTest {

	@Autowired JdbcClient jdbc;
	// The app's clock is the shared test clock, so Today's "now" is whatever it says; other tests move it, so times are
	// always taken from it rather than fixed.
	@Autowired TestClock clock;
	private final JsonMapper json = JsonMapper.builder().build();
	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("MMM d, HH:mm", Locale.US);
	private String owner;
	private String other;

	private String token(String email) {
		var user = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", user).param("email", email).update();
		return TestJwts.tokenFor(user, email);
	}

	private String id(String body) { return json.readTree(body).get("id").asText(); }

	private Instant now() { return clock.instant().truncatedTo(ChronoUnit.SECONDS); }

	private String newApplication(String token, String company) throws Exception {
		return id(post("/api/applications", token,
				"{\"company\":\"" + company + "\",\"role\":\"Engineer\",\"postingText\":\"Build web services\"}").body());
	}

	private int version(String app, String token) throws Exception {
		return json.readTree(get("/api/applications/" + app, token).body()).get("version").asInt();
	}

	/** Adds an interview starting at the given instant and returns its seq. */
	private int interview(String app, String token, Instant startsAt) throws Exception {
		var added = post("/api/applications/" + app + "/interviews", token, json.writeValueAsString(Map.of("startsAt", startsAt.toString(),
				"kind", "VIDEO", "version", version(app, token))));
		assertThat(added.statusCode()).as(added.body()).isEqualTo(201);
		int seq = 0;
		for (var entry : json.readTree(added.body()).get("timeline")) {
			if (entry.get("type").asText().equals("INTERVIEW")) seq = Math.max(seq, entry.get("seq").asInt());
		}
		return seq;
	}

	private void offer(String app, String token, LocalDate respondBy) throws Exception {
		var created = post("/api/applications/" + app + "/offers", token, json.writeValueAsString(Map.of("respondBy", respondBy.toString())));
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
	}

	private void close(String app, String token) throws Exception {
		var closed = post("/api/applications/" + app + "/stage", token,
				"{\"stage\":\"CLOSED\",\"closeReason\":\"NOT_SELECTED\",\"version\":" + version(app, token) + "}");
		assertThat(closed.statusCode()).as(closed.body()).isEqualTo(200);
	}

	private JsonNode today(String token) throws Exception {
		var response = get("/api/career/today", token);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return json.readTree(response.body());
	}

	private JsonNode today(String token, String timezone) throws Exception {
		var response = get("/api/career/today", token, "X-Timezone", timezone);
		assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
		return json.readTree(response.body());
	}

	/** The entry for an Application in one of Today's lists, or null when it is not there. */
	private static JsonNode entryFor(JsonNode list, String app) {
		for (var entry : list) {
			if (entry.get("applicationId").asText().equals(app)) return entry;
		}
		return null;
	}

	@BeforeEach
	void prepare() throws Exception {
		jdbc.sql("delete from users").update();
		owner = token("owner@example.com");
		other = token("other@example.com");
	}

	@Test
	void anInterviewInTwoHoursIsNeedsYouWithinTheDayAndNotComingUp() throws Exception {
		var app = newApplication(owner, "Soon Co");
		var seq = interview(app, owner, now().plus(Duration.ofHours(2)));

		var root = today(owner);
		var needs = entryFor(root.get("needsYou"), app);
		assertThat(needs).isNotNull();
		assertThat(needs.get("withinDay").asBoolean()).isTrue();
		assertThat(needs.get("interviewSeq").asInt()).isEqualTo(seq);
		assertThat(entryFor(root.get("comingUp"), app)).isNull();
	}

	@Test
	void anInterviewInFiveDaysIsComingUpAndNotWithinTheDay() throws Exception {
		var app = newApplication(owner, "Later Co");
		var seq = interview(app, owner, now().plus(Duration.ofDays(5)));

		var root = today(owner);
		var coming = entryFor(root.get("comingUp"), app);
		assertThat(coming).isNotNull();
		assertThat(coming.get("kind").asText()).isEqualTo("INTERVIEW");
		assertThat(coming.get("withinDay").asBoolean()).isFalse();
		assertThat(coming.get("interviewSeq").asInt()).isEqualTo(seq);
		assertThat(entryFor(root.get("needsYou"), app)).isNull();
	}

	@Test
	void anOfferWithRespondByInThreeDaysIsComingUpAsOfferDeadline() throws Exception {
		var app = newApplication(owner, "Offer Co");
		offer(app, owner, LocalDate.ofInstant(now(), ZoneId.of("UTC")).plusDays(3));

		var root = today(owner);
		var deadline = entryFor(root.get("comingUp"), app);
		assertThat(deadline).isNotNull();
		assertThat(deadline.get("kind").asText()).isEqualTo("OFFER_DEADLINE");
		assertThat(deadline.get("interviewSeq").isNull()).isTrue();
		assertThat(deadline.get("withinDay").asBoolean()).isFalse();
	}

	@Test
	void aClosedApplicationsItemsNeverAppear() throws Exception {
		var app = newApplication(owner, "Closed Co");
		interview(app, owner, now().plus(Duration.ofHours(2)));
		offer(app, owner, LocalDate.ofInstant(now(), ZoneId.of("UTC")).plusDays(3));
		close(app, owner);

		var root = today(owner);
		assertThat(entryFor(root.get("needsYou"), app)).isNull();
		assertThat(entryFor(root.get("comingUp"), app)).isNull();
	}

	@Test
	void anotherUsersTodayNeverHoldsTheseApplications() throws Exception {
		var app = newApplication(owner, "Private Co");
		interview(app, owner, now().plus(Duration.ofHours(2)));
		offer(app, owner, LocalDate.ofInstant(now(), ZoneId.of("UTC")).plusDays(3));

		var root = today(other);
		assertThat(root.get("needsYou")).isEmpty();
		assertThat(root.get("comingUp")).isEmpty();
		assertThat(entryFor(today(owner).get("needsYou"), app)).isNotNull();
	}

	@Test
	void theTimezoneHeaderChangesTheFormattedLabelOfAnInterview() throws Exception {
		var app = newApplication(owner, "Zone Co");
		var at = now().plus(Duration.ofDays(5)).truncatedTo(ChronoUnit.HOURS);
		interview(app, owner, at);

		var utc = entryFor(today(owner).get("comingUp"), app).get("label").asText();
		var auckland = entryFor(today(owner, "Pacific/Auckland").get("comingUp"), app).get("label").asText();
		assertThat(utc).isEqualTo("Interview " + WHEN.format(at.atZone(ZoneId.of("UTC"))));
		assertThat(auckland).isEqualTo("Interview " + WHEN.format(at.atZone(ZoneId.of("Pacific/Auckland"))));
		assertThat(auckland).isNotEqualTo(utc);
	}

	@Test
	void anInvalidTimezoneFallsBackToUtcWithoutError() throws Exception {
		var app = newApplication(owner, "Fallback Co");
		interview(app, owner, now().plus(Duration.ofDays(5)).truncatedTo(ChronoUnit.HOURS));

		var plain = get("/api/career/today", owner);
		var invalid = get("/api/career/today", owner, "X-Timezone", "Not/AZone");
		assertThat(invalid.statusCode()).as(invalid.body()).isEqualTo(200);
		assertThat(invalid.body()).isEqualTo(plain.body());
	}

}
