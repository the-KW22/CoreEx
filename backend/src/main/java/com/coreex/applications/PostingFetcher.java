package com.coreex.applications;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.common.ApiException;

/**
 * Fetches the page behind a link a User gave. This is the first place CoreEx fetches an address a User chose, so it is
 * strict (docs/career/applications-decisions.md, A5): http and https only, no credentials in the address, every
 * address the host resolves to must be public (checked after DNS resolution and again for each redirect, which are
 * followed by hand and at most {@code maxRedirects}), the page must be HTML, at most {@code maxBytes} and read within
 * {@code timeout}. No cookies are kept and nothing of the User's is sent.
 * shortcut: the connection is made by the JDK client, which resolves the host again; the JVM's DNS cache (30 seconds)
 * gives it the addresses just checked. Pin the checked address with a custom socket if rebinding ever matters.
 */
@Component
class PostingFetcher {

	/** The page's final address, after redirects, and its HTML. */
	record Page(String url, String html) {
	}

	private static final Pattern CHARSET = Pattern.compile("(?i)charset\\s*=\\s*\"?([\\w.:-]+)");

	private final Predicate<InetAddress> allowed;

	private final long maxBytes;

	private final Duration timeout;

	private final int maxRedirects;

	private final HttpClient client;

	@Autowired
	PostingFetcher(PostingProperties properties) {
		this(properties.allowPrivateHosts() ? address -> true : PublicHosts::isPublic, properties.maxBytes(),
				properties.timeout(), properties.maxRedirects());
	}

	PostingFetcher(Predicate<InetAddress> allowed, long maxBytes, Duration timeout, int maxRedirects) {
		this.allowed = allowed;
		this.maxBytes = maxBytes;
		this.timeout = timeout;
		this.maxRedirects = maxRedirects;
		this.client = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(timeout)
				.version(HttpClient.Version.HTTP_1_1).build();
	}

	Page fetch(String link) {
		var uri = parse(link);
		var deadline = System.nanoTime() + timeout.toNanos();
		for (int hop = 0;; hop++) {
			requirePublic(uri);
			var response = get(uri, deadline);
			var status = response.statusCode();
			if (status >= 300 && status < 400) {
				var location = response.headers().firstValue("Location").orElse(null);
				closeQuietly(response.body());
				if (location == null) {
					throw refused("The page could not be read: it moved without saying where.");
				}
				if (hop >= maxRedirects) {
					throw refused("The page sent you on too many redirects.");
				}
				uri = parse(uri.resolve(location.trim()).toString());
				continue;
			}
			if (status < 200 || status >= 300) {
				closeQuietly(response.body());
				throw refused("The page could not be read (it answered " + status + ").");
			}
			return new Page(uri.toString(), read(response, deadline));
		}
	}

	private static URI parse(String link) {
		var text = link == null ? "" : link.trim();
		URI uri;
		try {
			uri = new URI(text);
		}
		catch (java.net.URISyntaxException e) {
			throw refused("That is not a web address.");
		}
		var scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
		if (!scheme.equals("http") && !scheme.equals("https")) {
			throw refused("Only http and https links can be read.");
		}
		if (uri.getUserInfo() != null) {
			throw refused("A link with a user name or password cannot be read.");
		}
		if (uri.getHost() == null || uri.getHost().isBlank()) {
			throw refused("That is not a web address.");
		}
		return uri;
	}

	private void requirePublic(URI uri) {
		InetAddress[] addresses;
		try {
			addresses = InetAddress.getAllByName(uri.getHost());
		}
		catch (UnknownHostException e) {
			throw refused("That address could not be found.");
		}
		for (var address : addresses) {
			if (!allowed.test(address)) {
				throw refused("That address is not a public address, so it cannot be read.");
			}
		}
	}

	private HttpResponse<InputStream> get(URI uri, long deadline) {
		var left = Duration.ofNanos(Math.max(1, deadline - System.nanoTime()));
		var request = HttpRequest.newBuilder(uri).timeout(left)
				.header("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1").header("User-Agent", "CoreEx posting reader")
				.GET().build();
		try {
			return client.send(request, HttpResponse.BodyHandlers.ofInputStream());
		}
		catch (HttpTimeoutException e) {
			throw slow();
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw refused("The page could not be read.");
		}
		catch (IOException | RuntimeException e) {
			throw refused("The page could not be read.");
		}
	}

	private String read(HttpResponse<InputStream> response, long deadline) {
		var type = response.headers().firstValue("Content-Type").orElse("").toLowerCase(Locale.ROOT);
		if (!type.startsWith("text/html") && !type.startsWith("application/xhtml+xml")) {
			closeQuietly(response.body());
			throw refused("That link is not a web page.");
		}
		if (response.headers().firstValueAsLong("Content-Length").orElse(0) > maxBytes) {
			closeQuietly(response.body());
			throw refused("That page is too large to read.");
		}
		// A server that keeps the body coming slowly is cut off at the deadline by closing the stream.
		var cutOff = CompletableFuture.runAsync(() -> closeQuietly(response.body()),
				CompletableFuture.delayedExecutor(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS));
		var bytes = new ByteArrayOutputStream();
		try (var in = response.body()) {
			var buffer = new byte[8192];
			int n;
			while ((n = in.read(buffer)) != -1) {
				bytes.write(buffer, 0, n);
				if (bytes.size() > maxBytes) {
					throw refused("That page is too large to read.");
				}
			}
		}
		catch (IOException e) {
			throw System.nanoTime() >= deadline ? slow() : refused("The page could not be read.");
		}
		finally {
			cutOff.cancel(false);
		}
		return new String(bytes.toByteArray(), charset(type));
	}

	private static Charset charset(String contentType) {
		var matcher = CHARSET.matcher(contentType);
		if (matcher.find()) {
			try {
				return Charset.forName(matcher.group(1));
			}
			catch (RuntimeException e) {
				return StandardCharsets.UTF_8;
			}
		}
		return StandardCharsets.UTF_8;
	}

	private static void closeQuietly(InputStream in) {
		try {
			in.close();
		}
		catch (IOException e) {
			// Nothing to do: the answer is being dropped.
		}
	}

	private static ApiException slow() {
		return refused("The page did not answer in time.");
	}

	private static ApiException refused(String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", message);
	}

}
