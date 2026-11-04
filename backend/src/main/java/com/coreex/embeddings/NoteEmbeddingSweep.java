package com.coreex.embeddings;

import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.IntStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.coreex.embeddings.ChunkRepository.Added;
import com.coreex.embeddings.ChunkRepository.Snapshot;

/**
 * Keeps every live Note embedded (ADR 0008). It looks for Notes that have settled and whose Chunks are not current,
 * cuts each into Chunks, keeps the stored Chunks whose text did not change, and embeds only the rest, up to a ceiling
 * per run. What is left over, and anything the function could not do, is picked up by the next run, because what is
 * due is read from the database. It is safe to run twice.
 */
@Component
class NoteEmbeddingSweep {

	private static final Logger log = LoggerFactory.getLogger(NoteEmbeddingSweep.class);

	private final ChunkRepository chunks;

	private final Embedder embedder;

	private final SweepProperties properties;

	NoteEmbeddingSweep(ChunkRepository chunks, Embedder embedder, SweepProperties properties) {
		this.chunks = chunks;
		this.embedder = embedder;
		this.properties = properties;
	}

	// While the backend is awake; the free host sleeps when idle, and the next run after it wakes catches up.
	// shortcut: two API instances would sweep the same Notes and store duplicate Chunks; take a lock (an advisory
	// lock, or `for update skip locked` on the due Notes) when the API runs on more than one instance.
	@Scheduled(initialDelayString = "${coreex.embeddings.sweep.interval:PT1M}",
			fixedDelayString = "${coreex.embeddings.sweep.interval:PT1M}")
	void scheduled() {
		run(properties.settle());
	}

	/** Returns how many Chunks it embedded. */
	int run(Duration settle) {
		var budget = properties.maxChunks();
		var embedded = 0;
		for (var id : chunks.due(settle, Embedder.MODEL, properties.maxChunks())) {
			if (budget == 0) {
				break;
			}
			int count;
			try {
				count = refresh(id, budget);
			}
			catch (RuntimeException e) {
				// One Note that cannot be stored must not stop the others; never log its text.
				log.warn("Could not embed note {}: {}", id, e.getClass().getSimpleName());
				continue;
			}
			if (count < 0) {
				break; // the function is unavailable (already logged once); try again next run
			}
			budget -= count;
			embedded += count;
		}
		return embedded;
	}

	/** How many Chunks it embedded for the Note, or -1 when embedding is unavailable. */
	private int refresh(UUID noteId, int budget) {
		var note = chunks.snapshot(noteId);
		if (note.isEmpty()) {
			return 0; // trashed or removed since it was listed
		}
		var wanted = NoteChunker.split(note.get().title(), note.get().body());
		// The stored Chunks of this model, by hash: each one can serve one wanted Chunk with the same text.
		var reusable = new HashMap<String, ArrayDeque<UUID>>();
		for (var stored : chunks.storedFor(noteId)) {
			if (stored.model().equals(Embedder.MODEL)) {
				reusable.computeIfAbsent(stored.hash(), h -> new ArrayDeque<>()).add(stored.id());
			}
		}
		var kept = new HashMap<UUID, Integer>();
		var missing = new ArrayList<Integer>();
		for (var position = 0; position < wanted.size(); position++) {
			var same = reusable.get(wanted.get(position).hash());
			if (same != null && !same.isEmpty()) {
				kept.put(same.poll(), position);
			}
			else {
				missing.add(position);
			}
		}
		var now = missing.subList(0, Math.min(budget, missing.size()));
		var vectors = now.isEmpty() ? Optional.of(List.<float[]>of())
				: embedder.embed(now.stream().map(p -> wanted.get(p).text()).toList());
		if (vectors.isEmpty()) {
			return -1;
		}
		var added = IntStream.range(0, now.size())
				.mapToObj(i -> new Added(now.get(i), wanted.get(now.get(i)), vectors.get().get(i))).toList();
		chunks.replace(note.get(), kept, added, now.size() == missing.size());
		return now.size();
	}

}
