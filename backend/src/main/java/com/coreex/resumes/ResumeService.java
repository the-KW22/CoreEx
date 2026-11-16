package com.coreex.resumes;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;
import com.coreex.resumes.ResumeRepository.Summary;

@Service
public class ResumeService {

	static final int MAX_TITLE = 200;

	// The whole document as JSON; far above any real resume, it only stops a runaway client.
	private static final int MAX_DOCUMENT = 1_000_000;

	private final ResumeRepository resumes;

	ResumeService(ResumeRepository resumes) {
		this.resumes = resumes;
	}

	/** A Resume, and whether this call made it (false: it was already there, see the id form of {@code create}). */
	public record Created(Resume resume, boolean isNew) {
	}

	public record Page(List<Summary> items, long total) {
	}

	/**
	 * With an {@code id} the caller made up, a repeated request returns the Resume as stored instead of making a second
	 * one. Any other use of the id is refused with one answer, so it does not say whose it is.
	 */
	@Transactional
	public Created create(UUID ownerId, UUID id, String title, boolean sample) {
		if (id != null) {
			var existing = resumes.find(ownerId, id);
			if (existing.isPresent()) {
				return new Created(existing.get(), false);
			}
		}
		var made = insert(ownerId, id, title == null || title.isBlank() ? "My Resume" : title.strip(),
				sample ? ResumeSample.document() : ResumeDocument.blank());
		if (made == null) {
			var raced = resumes.find(ownerId, id).orElseThrow(() -> new ApiException(HttpStatus.BAD_REQUEST,
					"INVALID_REQUEST", "That id cannot be used for a new Resume."));
			return new Created(raced, false);
		}
		return new Created(get(ownerId, made), true);
	}

	public Resume get(UUID ownerId, UUID id) {
		return resumes.find(ownerId, id).orElseThrow(ResumeService::notFound);
	}

	// shortcut: a plain page of titles, no search or sort here, the library ticket (#255) adds them.
	public Page list(UUID ownerId, int page, int size) {
		return new Page(resumes.list(ownerId, size, (long) page * size), resumes.count(ownerId));
	}

	@Transactional
	public Resume save(UUID ownerId, UUID id, String title, ResumeDocument document, int seenVersion) {
		var clean = ResumeText.clean(document);
		var json = checked(clean);
		if (!resumes.save(ownerId, id, seenVersion, title.strip(), json, ResumeText.plain(clean), ResumeText.markdown(clean))) {
			// Missing (or someone else's) is 404; otherwise it is locked, or it moved on since the caller read it.
			throwIfLocked(get(ownerId, id));
			throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
					"This Resume was changed somewhere else since you opened it.");
		}
		return get(ownerId, id);
	}

	public void rename(UUID ownerId, UUID id, String title) {
		if (!resumes.rename(ownerId, id, title.strip())) {
			throwIfLocked(get(ownerId, id));
			throw notFound();
		}
	}

	public void setLocked(UUID ownerId, UUID id, boolean locked) {
		if (!resumes.setLocked(ownerId, id, locked)) {
			throw notFound();
		}
	}

	private static void throwIfLocked(Resume resume) {
		if (resume.locked()) {
			throw new ApiException(HttpStatus.CONFLICT, "RESUME_LOCKED", "This Resume is locked. Unlock it to change it.");
		}
	}

	@Transactional
	public Resume duplicate(UUID ownerId, UUID id) {
		var source = get(ownerId, id);
		var title = source.title().length() > MAX_TITLE - 7 ? source.title().substring(0, MAX_TITLE - 7) : source.title();
		return get(ownerId, insert(ownerId, null, title + " (copy)", source.document()));
	}

	private UUID insert(UUID ownerId, UUID id, String title, ResumeDocument document) {
		var clean = ResumeText.clean(document);
		return resumes.insert(ownerId, id, title, checked(clean), ResumeText.plain(clean), ResumeText.markdown(clean))
				.orElse(null);
	}

	/** The document as JSON, refused when it is too big, holds a NUL character (Postgres cannot store one) or has a custom style rule that cannot be drawn. */
	private String checked(ResumeDocument document) {
		var json = resumes.toJson(document);
		if (json.length() > MAX_DOCUMENT || json.indexOf('\0') >= 0 || json.contains("\\u0000")) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
					"The Resume is too big or holds a character that cannot be stored.");
		}
		var css = ResumeCss.problems(document.metadata().customCss());
		if (!css.isEmpty()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Custom style: " + String.join(" ", css));
		}
		return json;
	}

	private static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such Resume.");
	}

}
