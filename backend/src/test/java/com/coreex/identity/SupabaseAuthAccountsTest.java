package com.coreex.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.coreex.common.ApiException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/** The real Auth admin client against a tiny local HTTP server. */
class SupabaseAuthAccountsTest {

	private record Seen(String method, String path, String apikey, String authorization) {
	}

	private HttpServer server;

	private final List<Seen> seen = new ArrayList<>();

	private int status = 200;

	private SupabaseAuthAccounts accounts;

	private final UUID id = UUID.randomUUID();

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", this::handle);
		server.start();
		accounts = accountsAt("http://127.0.0.1:" + server.getAddress().getPort() + "/auth/v1", "sb_secret_test");
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	private static SupabaseAuthAccounts accountsAt(String url, String key) {
		return new SupabaseAuthAccounts(new AuthProperties(url, key));
	}

	private void handle(HttpExchange exchange) throws IOException {
		seen.add(new Seen(exchange.getRequestMethod(), exchange.getRequestURI().getPath(),
				exchange.getRequestHeaders().getFirst("apikey"), exchange.getRequestHeaders().getFirst("Authorization")));
		exchange.sendResponseHeaders(status, -1);
		exchange.close();
	}

	@Test
	void deletesTheUserWithTheSecretKeyInBothHeaders() {
		accounts.delete(id);

		assertThat(seen).containsExactly(
				new Seen("DELETE", "/auth/v1/admin/users/" + id, "sb_secret_test", "Bearer sb_secret_test"));
	}

	@Test
	void anAlreadyDeletedSignInCountsAsDone() {
		status = 404;

		accounts.delete(id);
	}

	@Test
	void aRefusedKeyOrAnOutageIsUnavailableNotDone() {
		for (var failure : new int[] { 401, 403, 500 }) {
			status = failure;
			assertThatThrownBy(() -> accounts.delete(id)).isInstanceOfSatisfying(ApiException.class,
					e -> assertThat(e.code()).isEqualTo("AUTH_UNAVAILABLE"));
		}
	}

	@Test
	void withoutAUrlOrKeyNothingIsSent() {
		assertThatThrownBy(() -> accountsAt("", "key").delete(id)).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> accountsAt("http://127.0.0.1/auth/v1", "").delete(id)).isInstanceOf(ApiException.class);
		assertThat(seen).isEmpty();
	}

}
