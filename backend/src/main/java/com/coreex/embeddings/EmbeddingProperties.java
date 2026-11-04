package com.coreex.embeddings;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Where the {@code embed} Edge Function is ({@code https://<project>.supabase.co/functions/v1/embed-<random>}), the secret that
 * lets the API call it, how long one call may take, and how many texts one call may carry. An empty url or secret
 * means embeddings are not set up. The batch size must not exceed the function's own cap (its {@code MAX_BATCH}).
 */
@ConfigurationProperties("coreex.embeddings")
record EmbeddingProperties(@DefaultValue("") String url, @DefaultValue("") String secret,
		@DefaultValue("PT3S") Duration timeout, @DefaultValue("3") int batchSize) {

	EmbeddingProperties {
		// A batch of 0 would loop forever sending nothing.
		if (batchSize < 1) {
			throw new IllegalArgumentException("coreex.embeddings.batch-size must be at least 1");
		}
	}

}
