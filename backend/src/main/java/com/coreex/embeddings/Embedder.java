package com.coreex.embeddings;

import java.util.List;
import java.util.Optional;

/**
 * The only way the rest of the backend turns text into vectors for Semantic search (ADR 0008). Everything else depends
 * on this interface, never on Supabase; tests replace it with a fake.
 */
public interface Embedder {

	/** How many numbers each vector has: what {@code gte-small} produces. */
	int DIMENSIONS = 384;

	/** The model's name, kept with every stored Chunk: vectors of different models cannot be compared. */
	String MODEL = "gte-small";

	/**
	 * One vector per text, in the same order, or empty when embedding is unavailable (not set up, unreachable, too
	 * slow, or answering something unexpected). It never throws: search falls back to exact words and a sweep tries
	 * again later.
	 */
	Optional<List<float[]>> embed(List<String> texts);

	/** pgvector's text form of a vector, {@code [0.1,0.2,...]}, which Postgres casts to {@code halfvec}. */
	static String literal(float[] vector) {
		var text = new StringBuilder("[");
		for (var i = 0; i < vector.length; i++) {
			text.append(i == 0 ? "" : ",").append(vector[i]);
		}
		return text.append(']').toString();
	}

}
