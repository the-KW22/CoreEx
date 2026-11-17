package com.coreex.career;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

import com.coreex.ApiTest;
import com.coreex.TestJwts;

import tools.jackson.databind.json.JsonMapper;

class CareerOffersApiTest extends ApiTest {

	@Autowired JdbcClient jdbc;
	private final JsonMapper json = JsonMapper.builder().build();
	private String owner;
	private String other;
	private String application;

	private String token(String email) {
		var user = UUID.randomUUID();
		jdbc.sql("insert into users (id, email, role) values (:id, :email, 'USER')").param("id", user).param("email", email).update();
		return TestJwts.tokenFor(user, email);
	}

	private String id(String body) { return json.readTree(body).get("id").asText(); }

	/** A body of the given terms; a null value is sent as null, so it is unknown. */
	private String terms(Object... keyValues) throws Exception {
		var body = new LinkedHashMap<String, Object>();
		for (int i = 0; i < keyValues.length; i += 2) body.put((String) keyValues[i], keyValues[i + 1]);
		return json.writeValueAsString(body);
	}

	private String create(String app, String body) throws Exception {
		return post("/api/applications/" + app + "/offers", owner, body).body();
	}

	private void savePreferences() throws Exception {
		assertThat(put("/api/knowledge/preferences", owner, terms("targetRoles", "", "places", List.of("REMOTE"), "minBasePay", 50000,
				"currency", "GBP", "payPeriod", "YEAR", "officeDaysPerWeek", 2, "noticePeriod", "")).statusCode()).isEqualTo(200);
	}

	@BeforeEach
	void prepare() throws Exception {
		jdbc.sql("delete from users").update();
		owner = token("owner@example.com");
		other = token("other@example.com");
		application = id(post("/api/applications", owner,
				"{\"company\":\"Example\",\"role\":\"Engineer\",\"postingText\":\"Build web services\"}").body());
	}

	@Test
	void anEmptyOfferKeepsEveryTermUnknownAfterReload() throws Exception {
		var created = post("/api/applications/" + application + "/offers", owner, "{}");
		assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
		var listed = json.readTree(get("/api/applications/" + application + "/offers", owner).body()).get("items");
		assertThat(listed).hasSize(1);
		var offer = listed.get(0);
		for (var name : List.of("basePay", "currency", "payPeriod", "bonus", "equity", "benefits", "startDate", "place", "officeDays",
				"respondBy")) {
			assertThat(offer.get("terms").path(name).isNull()).as(name).isTrue();
		}
		assertThat(offer.get("checks")).isEmpty();
	}

	@Test
	void blankTextAndUnknownNumbersStayNullNotZeroOrEmpty() throws Exception {
		var created = create(application, terms("basePay", null, "bonus", "", "equity", "   ", "place", "", "officeDays", null));
		var offer = json.readTree(created);
		assertThat(offer.get("terms").get("bonus").isNull()).isTrue();
		assertThat(offer.get("terms").get("equity").isNull()).isTrue();
		assertThat(offer.get("terms").get("place").isNull()).isTrue();
		assertThat(offer.get("terms").get("officeDays").isNull()).isTrue();
		var again = json.readTree(get("/api/offers", owner).body()).get("items").get(0).get("offer");
		assertThat(again.get("terms").get("basePay").isNull()).isTrue();
		assertThat(again.get("terms").get("bonus").isNull()).isTrue();
	}

	@Test
	void anEditKeepsTheEarlierTermsAsAVersion() throws Exception {
		var offer = id(create(application, terms("basePay", 60000, "currency", "GBP", "payPeriod", "YEAR", "bonus", "10%")));
		var edited = put("/api/offers/" + offer, owner, terms("basePay", 65000, "currency", "GBP", "payPeriod", "YEAR", "bonus", "",
				"version", 1));
		assertThat(edited.statusCode()).as(edited.body()).isEqualTo(200);
		assertThat(json.readTree(edited.body()).get("version").asInt()).isEqualTo(2);
		var versions = json.readTree(get("/api/offers/" + offer + "/versions", owner).body()).get("items");
		assertThat(versions).hasSize(1);
		assertThat(versions.get(0).get("version").asInt()).isEqualTo(1);
		assertThat(versions.get(0).get("savedAt").asText()).isNotBlank();
		assertThat(versions.get(0).get("terms").get("basePay").decimalValue()).isEqualByComparingTo("60000");
		assertThat(versions.get(0).get("terms").get("bonus").asText()).isEqualTo("10%");
	}

	@Test
	void aStaleVersionIsRefusedWithConflict() throws Exception {
		var offer = id(create(application, "{}"));
		var path = "/api/offers/" + offer;
		assertThat(put(path, owner, terms("basePay", 60000, "version", 1)).statusCode()).isEqualTo(200);
		var stale = put(path, owner, terms("basePay", 61000, "version", 1));
		assertThat(stale.statusCode()).isEqualTo(409);
		assertThat(stale.body()).contains("CONFLICT");
		assertThat(put(path, owner, "{}").statusCode()).isEqualTo(400);
	}

	@Test
	void anotherUsersApplicationOfferAndVersionsAreNotFound() throws Exception {
		var offer = id(create(application, terms("basePay", 60000, "currency", "GBP", "payPeriod", "YEAR")));
		var b = other;
		assertThat(post("/api/applications/" + application + "/offers", b, "{}").statusCode()).isEqualTo(404);
		assertThat(get("/api/applications/" + application + "/offers", b).statusCode()).isEqualTo(404);
		assertThat(put("/api/offers/" + offer, b, terms("version", 1)).statusCode()).isEqualTo(404);
		assertThat(get("/api/offers/" + offer + "/versions", b).statusCode()).isEqualTo(404);
		assertThat(get("/api/offers/compare?a=" + offer + "&b=" + offer, b).statusCode()).isEqualTo(404);
		assertThat(json.readTree(get("/api/offers", b).body()).get("items")).isEmpty();
		assertThat(json.readTree(get("/api/offers", owner).body()).get("items")).hasSize(1);
	}

	@Test
	void anOfferOfATrashedApplicationIsNotListed() throws Exception {
		var offer = id(create(application, "{}"));
		assertThat(delete("/api/applications/" + application, owner).statusCode()).isEqualTo(204);
		assertThat(json.readTree(get("/api/offers", owner).body()).get("items")).isEmpty();
		assertThat(get("/api/offers/" + offer + "/versions", owner).statusCode()).isEqualTo(404);
		assertThat(get("/api/applications/" + application + "/offers", owner).statusCode()).isEqualTo(404);
	}

	@Test
	void compareRefusesMixedUnitsAndCompareMatchingOffers() throws Exception {
		var gbp = id(create(application, terms("basePay", 50000, "currency", "GBP", "payPeriod", "YEAR")));
		var usd = id(create(application, terms("basePay", 60000, "currency", "USD", "payPeriod", "YEAR")));
		var monthly = id(create(application, terms("basePay", 4000, "currency", "GBP", "payPeriod", "MONTH")));
		var refused = get("/api/offers/compare?a=" + gbp + "&b=" + usd, owner);
		assertThat(refused.statusCode()).isEqualTo(422);
		assertThat(refused.body()).contains("NOT_COMPARABLE", "does not convert currency");
		assertThat(get("/api/offers/compare?a=" + gbp + "&b=" + monthly, owner).statusCode()).isEqualTo(422);
		var same = get("/api/offers/compare?a=" + gbp + "&b=" + id(create(application, terms("basePay", 55000, "currency", "GBP",
				"payPeriod", "YEAR"))), owner);
		assertThat(same.statusCode()).isEqualTo(200);
		assertThat(json.readTree(same.body()).get("a").get("id").asText()).isEqualTo(gbp);
	}

	@Test
	void belowMinimumPayAndOtherPreferenceMismatchesAreFlaggedThroughTheApi() throws Exception {
		savePreferences();
		var offer = json.readTree(create(application, terms("basePay", 40000, "currency", "GBP", "payPeriod", "YEAR",
				"place", "Berlin office", "officeDays", 3)));
		var codes = new java.util.ArrayList<String>();
		for (var check : offer.get("checks")) codes.add(check.get("code").asText());
		assertThat(codes).containsExactlyInAnyOrder("BELOW_MINIMUM_PAY", "PLACE_NOT_PREFERRED", "MORE_OFFICE_DAYS");
		var listed = json.readTree(get("/api/applications/" + application + "/offers", owner).body()).get("items").get(0);
		assertThat(listed.get("checks")).hasSize(3);
	}

}
