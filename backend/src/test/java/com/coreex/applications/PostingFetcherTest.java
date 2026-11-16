package com.coreex.applications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.coreex.common.ApiException;
import com.sun.net.httpserver.HttpServer;

/**
 * The fetch of a posting's page, against a small server on this machine. The guard is the real one except that the
 * loopback address (where that server lives) is let through; every other internal address is refused as in production.
 */
class PostingFetcherTest {

	private HttpServer server;

	private String base;

	private PostingFetcher fetcher;

	private final AtomicInteger hits = new AtomicInteger();

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
		server.createContext("/page", exchange -> {
			hits.incrementAndGet();
			reply(exchange, 200, "text/html; charset=utf-8", "<html><title>Hello</title><body>Hi</body></html>");
		});
		server.createContext("/big", exchange -> reply(exchange, 200, "text/html", "x".repeat(3_000)));
		server.createContext("/json", exchange -> reply(exchange, 200, "application/json", "{}"));
		server.createContext("/slow", exchange -> {
			try {
				Thread.sleep(2_000);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
			reply(exchange, 200, "text/html", "late");
		});
		server.createContext("/gone", exchange -> reply(exchange, 404, "text/html", "no"));
		server.createContext("/to-private", exchange -> redirect(exchange, "http://10.0.0.1/secret"));
		server.createContext("/to-metadata", exchange -> redirect(exchange, "http://169.254.169.254/latest/meta-data"));
		server.createContext("/to-file", exchange -> redirect(exchange, "file:///etc/passwd"));
		server.createContext("/hop", exchange -> {
			var n = Integer.parseInt(exchange.getRequestURI().getQuery());
			redirect(exchange, n == 0 ? "/page" : "/hop?" + (n - 1));
		});
		server.start();
		base = "http://127.0.0.1:" + server.getAddress().getPort();
		fetcher = new PostingFetcher(address -> address.isLoopbackAddress() || PublicHosts.isPublic(address), 1_000,
				Duration.ofMillis(800), 3);
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	private static void reply(com.sun.net.httpserver.HttpExchange exchange, int status, String type, String body)
			throws IOException {
		var bytes = body.getBytes(StandardCharsets.UTF_8);
		exchange.getResponseHeaders().add("Content-Type", type);
		exchange.sendResponseHeaders(status, bytes.length);
		exchange.getResponseBody().write(bytes);
		exchange.close();
	}

	private static void redirect(com.sun.net.httpserver.HttpExchange exchange, String to) throws IOException {
		exchange.getResponseHeaders().add("Location", to);
		exchange.sendResponseHeaders(302, -1);
		exchange.close();
	}

	private void refused(String url, String reason) {
		assertThatThrownBy(() -> fetcher.fetch(url)).isInstanceOf(ApiException.class).hasMessageContaining(reason);
	}

	@Test
	void aPageIsReadWithItsFinalAddress() {
		var page = fetcher.fetch(base + "/page");

		assertThat(page.html()).contains("<title>Hello</title>");
		assertThat(page.url()).isEqualTo(base + "/page");
	}

	@Test
	void upToThreeRedirectsAreFollowedAndAFourthIsNot() {
		assertThat(fetcher.fetch(base + "/hop?2").html()).contains("Hello");
		refused(base + "/hop?3", "too many redirects");
	}

	@Test
	void aRedirectIntoAPrivateOrMetadataAddressOrAnotherSchemeIsRefusedWithoutConnecting() {
		refused(base + "/to-private", "not a public address");
		refused(base + "/to-metadata", "not a public address");
		refused(base + "/to-file", "http and https");
	}

	@Test
	void theStartingAddressIsCheckedToo() {
		var strict = new PostingFetcher(PublicHosts::isPublic, 1_000, Duration.ofMillis(800), 3);

		for (var url : new String[] { "http://localhost/", base + "/page", "http://127.0.0.1/", "http://[::1]/",
				"http://10.1.2.3/", "http://172.16.0.9/", "http://192.168.1.1/", "http://169.254.169.254/",
				"http://[fe80::1]/", "http://[fd00::1]/", "http://0.0.0.0/", "http://100.64.0.1/",
				"http://[::ffff:127.0.0.1]/" }) {
			assertThatThrownBy(() -> strict.fetch(url)).as(url).isInstanceOf(ApiException.class)
					.hasMessageContaining("not a public address");
		}
		assertThat(hits.get()).isZero();
	}

	@Test
	void onlyHttpAndHttpsWithoutACredentialAreFetched() {
		for (var url : new String[] { "ftp://example.com/x", "file:///etc/passwd", "gopher://example.com/", "javascript:alert(1)",
				"example.com/jobs", "", "   " }) {
			assertThatThrownBy(() -> fetcher.fetch(url)).as(url).isInstanceOf(ApiException.class);
		}
		refused("http://user:secret@example.com/", "a user name or password");
	}

	@Test
	void aPageBeyondTheSizeCapOrNotHtmlOrNotFoundOrTooSlowIsRefused() {
		refused(base + "/big", "too large");
		refused(base + "/json", "not a web page");
		refused(base + "/gone", "could not be read");
		refused(base + "/slow", "did not answer in time");
	}

}
