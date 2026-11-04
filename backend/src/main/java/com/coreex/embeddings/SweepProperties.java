package com.coreex.embeddings;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The sweep that keeps Notes embedded: how long a Note must stay unchanged before it is embedded (autosave fires about
 * a second after typing stops, so a Note being written would otherwise be embedded over and over), and the most Chunks
 * one run may send, which keeps a first run over many Notes from spending the free monthly quota in one go.
 * {@code coreex.embeddings.sweep.interval} (default one minute) is how often it runs.
 */
@ConfigurationProperties("coreex.embeddings.sweep")
record SweepProperties(@DefaultValue("PT2M") Duration settle, @DefaultValue("50") int maxChunks) {

	SweepProperties {
		// A ceiling of 0 would never embed anything.
		if (maxChunks < 1) {
			throw new IllegalArgumentException("coreex.embeddings.sweep.max-chunks must be at least 1");
		}
	}

}
