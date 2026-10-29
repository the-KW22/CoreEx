package com.coreex.trash;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.junit.jupiter.api.Test;

import com.coreex.ApiTest;

/** With no token configured the trigger does not exist, so an empty header can never match an empty setting. */
class TrashPurgeDisabledTest extends ApiTest {

	@Test
	void withoutAConfiguredTokenNothingOpensTheTrigger() throws Exception {
		for (var header : new String[] { null, "", "anything" }) {
			var request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/internal/trash/purge"))
					.POST(HttpRequest.BodyPublishers.noBody());
			if (header != null) {
				request.header("X-Purge-Token", header);
			}

			HttpResponse<String> response = HttpClient.newHttpClient().send(request.build(),
					HttpResponse.BodyHandlers.ofString());

			assertThat(response.statusCode()).as("header " + header).isEqualTo(404);
		}
	}

}
