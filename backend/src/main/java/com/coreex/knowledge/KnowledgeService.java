package com.coreex.knowledge;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;
import com.coreex.knowledge.KnowledgeRepository.FactRow;
import com.coreex.knowledge.KnowledgeRepository.PreferencesRow;
import com.coreex.knowledge.KnowledgeRepository.Revision;
import com.coreex.knowledge.KnowledgeRepository.StoryRow;
import com.coreex.notes.Note;
import com.coreex.notes.NoteService;

@Service
public class KnowledgeService {

	/** The five headings every new Story starts with (decision C5). */
	static final String STORY_BODY = """
			## Situation


			## Task


			## Action


			## Result


			## Reflection

			""";

	private static final List<String> PLACES = List.of("REMOTE", "HYBRID", "ONSITE");

	private final KnowledgeRepository repo;

	private final NoteService notes;

	KnowledgeService(KnowledgeRepository repo, NoteService notes) {
		this.repo = repo;
		this.notes = notes;
	}

	/** A Fact with its earlier wordings, oldest first. */
	public record FactView(FactRow fact, List<Revision> revisions) {
	}

	/** One line of a Resume or Note that could become a Fact; the quote is its exact text in the source. */
	record Candidate(String sourceKind, UUID sourceId, String quote) {
	}

	/** One Fact of this User with its earlier wordings; 404 when there is none. */
	public FactView factView(UUID ownerId, UUID id) {
		return view(ownerId, id);
	}

	public List<FactView> facts(UUID ownerId, String category, String status) {
		// shortcut: the Facts list is unpaged, upgrade to paging when a User holds hundreds of Facts.
		var facts = repo.facts(ownerId, category, status);
		var revisions = repo.revisionsOf(ownerId, facts.stream().map(f -> f.id()).toList());
		return facts.stream().map(f -> new FactView(f, revisions.getOrDefault(f.id(), List.of()))).toList();
	}

	/**
	 * A Fact by hand (no source) or one pulled from a Resume or Note. A pulled Fact's quote must still be in the source,
	 * and a source text the User forgot cannot come back.
	 */
	@Transactional
	public FactView create(UUID ownerId, String text, String category, String sourceKind, UUID sourceId, String quote) {
		String key = null;
		if (!"MANUAL".equals(sourceKind)) {
			var source = sourceText(ownerId, sourceKind, sourceId);
			if (quote == null || quote.isBlank() || !source.contains(quote)) {
				throw new ApiException(HttpStatus.BAD_REQUEST, "QUOTE_NOT_IN_SOURCE",
						"That quote is not in the current text of the source.");
			}
			key = sourceKey(sourceKind, sourceId, quote);
			if (repo.tombstoned(ownerId, key)) {
				throw new ApiException(HttpStatus.CONFLICT, "FORGOTTEN", "This was forgotten, so it cannot be added again.");
			}
		}
		var id = repo.insertFact(ownerId, text, category, sourceKind, sourceId, key == null ? null : quote, key);
		if (id.isEmpty()) {
			throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE", "A Fact from this source is already in Knowledge.");
		}
		return view(ownerId, id.get());
	}

	/** Correcting keeps the earlier wording as a revision. */
	@Transactional
	public FactView correct(UUID ownerId, UUID id, String text, String category) {
		var old = fact(ownerId, id);
		if (!old.text().equals(text)) {
			repo.saveRevision(ownerId, id, old.text());
		}
		repo.updateFact(ownerId, id, text, category);
		return view(ownerId, id);
	}

	/** Switched-off Facts are kept but never sent to a model. */
	@Transactional
	public FactView setStatus(UUID ownerId, UUID id, String status) {
		fact(ownerId, id);
		repo.setStatus(ownerId, id, status);
		return view(ownerId, id);
	}

	/** Deletes the text and its revisions; a pulled Fact leaves a content-free tombstone of its source key. */
	@Transactional
	public void forget(UUID ownerId, UUID id) {
		var old = fact(ownerId, id);
		repo.deleteFact(ownerId, id);
		if (old.sourceKey() != null) {
			repo.tombstone(ownerId, old.sourceKey());
		}
	}

	/** The lines of a Resume or Note that are not yet Facts and were not forgotten. */
	public List<Candidate> candidates(UUID ownerId, String sourceKind, UUID sourceId) {
		if (!"RESUME".equals(sourceKind) && !"NOTE".equals(sourceKind)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Only a Resume or a Note has candidates.");
		}
		var source = sourceText(ownerId, sourceKind, sourceId);
		var taken = repo.sourceKeys(ownerId);
		var found = new java.util.ArrayList<Candidate>();
		for (var line : CandidateSplitter.split(source)) {
			var key = sourceKey(sourceKind, sourceId, line);
			if (!taken.contains(key) && !repo.tombstoned(ownerId, key)) {
				found.add(new Candidate(sourceKind, sourceId, line));
			}
		}
		return found;
	}

	public List<StoryRow> stories(UUID ownerId) {
		return repo.stories(ownerId);
	}

	/** A new Note with the five Story headings and the Story flag set. */
	@Transactional
	public Note newStory(UUID ownerId, String title) {
		var note = notes.create(ownerId, null, title == null || title.isBlank() ? "Untitled Story" : title, STORY_BODY);
		repo.setStory(ownerId, note.id(), true);
		return note;
	}

	/** Setting false removes the Note from the Stories list; it stays a normal Note. */
	public void setStory(UUID ownerId, UUID noteId, boolean story) {
		notes.get(ownerId, noteId);
		repo.setStory(ownerId, noteId, story);
	}

	public Optional<PreferencesRow> preferences(UUID ownerId) {
		return repo.preferences(ownerId);
	}

	@Transactional
	public void savePreferences(UUID ownerId, String targetRoles, List<String> places, BigDecimal minBasePay, String currency,
			String payPeriod, Integer officeDays, String noticePeriod) {
		if (minBasePay != null && (currency == null || payPeriod == null)) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "A minimum pay needs a currency and a pay period.");
		}
		// A null element would throw inside List.of's contains, so it is checked first.
		if (places != null && places.stream().anyMatch(p -> p == null || !PLACES.contains(p))) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Places are REMOTE, HYBRID or ONSITE.");
		}
		repo.savePreferences(ownerId, new PreferencesRow(targetRoles == null ? "" : targetRoles,
				places == null ? List.of() : places.stream().distinct().toList(), minBasePay, currency, payPeriod, officeDays,
				noticePeriod == null ? "" : noticePeriod));
	}

	private FactRow fact(UUID ownerId, UUID id) {
		return repo.fact(ownerId, id).orElseThrow(KnowledgeService::notFound);
	}

	private FactView view(UUID ownerId, UUID id) {
		return new FactView(fact(ownerId, id), repo.revisions(ownerId, id));
	}

	/** A Resume or Note of this User; anything else is 404, so another User's text is never read. */
	private String sourceText(UUID ownerId, String sourceKind, UUID sourceId) {
		Optional<String> text = "RESUME".equals(sourceKind) ? repo.resumeText(ownerId, sourceId) : repo.noteText(ownerId, sourceId);
		return text.orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Resume or Note."));
	}

	// shortcut: the key is a SHA-256 of the quote, not random, so a forgotten Fact's quote could be guessed from a key; upgrade to a keyed HMAC when the key store moves to secrets config.
	static String sourceKey(String sourceKind, UUID sourceId, String quote) {
		try {
			var digest = MessageDigest.getInstance("SHA-256").digest(quote.getBytes(StandardCharsets.UTF_8));
			return sourceKind + ":" + sourceId + ":" + HexFormat.of().formatHex(digest);
		}
		catch (java.security.NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Fact.");
	}

}
