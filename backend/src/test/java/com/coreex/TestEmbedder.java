package com.coreex;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;

import com.coreex.embeddings.Embedder;

/**
 * Stands in for the {@code embed} Edge Function: a word-hashing vector, so texts that share words are close and every
 * run gives the same numbers. Remembers every text it was asked to embed, so a test can prove what was (not) sent.
 */
public class TestEmbedder implements Embedder {

	private final List<String> sent = Collections.synchronizedList(new ArrayList<>());

	private volatile boolean down;

	/** Every text embedded since the last {@link #clear()}, in order. */
	public List<String> sent() {
		return List.copyOf(sent);
	}

	public void clear() {
		sent.clear();
		down = false;
	}

	/** Makes every call answer "unavailable", like an unreachable function. */
	public void setDown(boolean down) {
		this.down = down;
	}

	@Override
	public Optional<List<float[]>> embed(List<String> texts) {
		if (down) {
			return Optional.empty();
		}
		sent.addAll(texts);
		return Optional.of(texts.stream().map(TestEmbedder::vector).toList());
	}

	private static float[] vector(String text) {
		var vector = new float[DIMENSIONS];
		for (var word : text.toLowerCase().split("\\W+")) {
			vector[Math.floorMod(word.hashCode(), DIMENSIONS)]++;
		}
		var norm = 0f;
		for (var x : vector) {
			norm += x * x;
		}
		norm = (float) Math.sqrt(norm);
		for (var i = 0; i < vector.length && norm > 0; i++) {
			vector[i] /= norm;
		}
		return vector;
	}

}
