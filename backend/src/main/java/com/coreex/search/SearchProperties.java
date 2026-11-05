package com.coreex.search;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * How close (cosine similarity, 0 to 1) a Chunk must be to a query to count as a match by meaning. {@code gte-small}
 * squeezes everything into a narrow band: tried on this project's own notes, unrelated English text scored 0.72 to
 * 0.77 and related text 0.81 to 0.86, so the line sits between them. Lower it to find more, raise it to find less.
 * {@code minSimilarNotes} is the same line for two Notes, set higher: a Suggested Link should be worth reading.
 */
@ConfigurationProperties("coreex.embeddings.search")
record SearchProperties(@DefaultValue("0.79") double minSimilarity, @DefaultValue("0.82") double minSimilarNotes) {

	SearchProperties {
		if (minSimilarity < 0 || minSimilarity > 1) {
			throw new IllegalArgumentException("coreex.embeddings.search.min-similarity must be between 0 and 1");
		}
		if (minSimilarNotes < 0 || minSimilarNotes > 1) {
			throw new IllegalArgumentException("coreex.embeddings.search.min-similar-notes must be between 0 and 1");
		}
	}

}
