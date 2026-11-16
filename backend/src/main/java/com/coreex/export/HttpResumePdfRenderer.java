package com.coreex.export;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import org.springframework.stereotype.Component;

import tools.jackson.databind.json.JsonMapper;

/**
 * Asks the frontend's PDF route (coreex.export.pdf-url) to draw the Resume, proving who it is with the shared secret in
 * X-Export-Secret. Not configured, a refusal, or a broken answer all throw, and the secret is never written anywhere.
 */
@Component
class HttpResumePdfRenderer implements ResumePdfRenderer {

	static final String SECRET_HEADER = "X-Export-Secret";

	private static final byte[] PDF_MARK = "%PDF".getBytes(StandardCharsets.US_ASCII);

	private final ExportProperties properties;

	private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

	private final JsonMapper json = JsonMapper.builder().build();

	HttpResumePdfRenderer(ExportProperties properties) {
		this.properties = properties;
	}

	@Override
	public byte[] render(ResumePdfRequest request) throws IOException {
		var url = properties.pdfUrl();
		var secret = properties.pdfSecret();
		if (url == null || url.isBlank() || secret == null || secret.isBlank()) {
			throw new IOException("The PDF renderer is not configured.");
		}
		var call = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(60))
				.header("Content-Type", "application/json").header(SECRET_HEADER, secret)
				.POST(HttpRequest.BodyPublishers.ofByteArray(json.writeValueAsBytes(request))).build();
		try {
			var answer = http.send(call, HttpResponse.BodyHandlers.ofByteArray());
			if (answer.statusCode() != 200) {
				throw new IOException("The PDF renderer answered " + answer.statusCode() + ".");
			}
			if (!startsWith(answer.body(), PDF_MARK)) {
				throw new IOException("The PDF renderer did not send a PDF.");
			}
			return answer.body();
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IOException("The PDF renderer was interrupted.", e);
		}
	}

	private static boolean startsWith(byte[] bytes, byte[] prefix) {
		if (bytes.length < prefix.length) {
			return false;
		}
		for (int i = 0; i < prefix.length; i++) {
			if (bytes[i] != prefix[i]) {
				return false;
			}
		}
		return true;
	}

}
