package com.coreex.resumes;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.coreex.common.ApiException;

@Service
public class ResumeService {

	static final int MAX_TITLE = 200;

	// The whole document as JSON; far above any real resume, it only stops a runaway client.
	private static final int MAX_DOCUMENT = 1_000_000;

	private final ResumeRepository resumes;

	private final ResumeVersionRepository versions;

	private final Clock clock;

	ResumeService(ResumeRepository resumes, ResumeVersionRepository versions, Clock clock) {
		this.resumes = resumes;
		this.versions = versions;
		this.clock = clock;
	}

	/** A Resume, and whether this call made it (false: it was already there, see the id form of {@code create}). */
	public record Created(Resume resume, boolean isNew) {
	}

	/** A Resume in a list, without its document. */
	public record Row(UUID id, String title, ResumeKind kind, UUID folderId, Instant createdAt, Instant updatedAt) {
	}

	public record Page(List<Row> items, long total) {
	}

	/**
	 * With an {@code id} the caller made up, a repeated request returns the Resume as stored instead of making a second
	 * one. Any other use of the id is refused with one answer, so it does not say whose it is.
	 */
	/**
	 * With an {@code imported} document (a file the User brought in) the Resume starts from it, checked and sanitised
	 * exactly like a save; a refused one makes nothing. It wins over {@code sample}. A null {@code kind} is a RESUME.
	 */
	@Transactional
	public Created create(UUID ownerId, UUID id, String title, boolean sample, ResumeKind kind, ResumeDocument imported) {
		if (id != null) {
			var existing = resumes.find(ownerId, id);
			if (existing.isPresent()) {
				return new Created(existing.get(), false);
			}
		}
		if (imported != null) {
			requirePhoto(ownerId, "", imported.basics().photo().assetId());
		}
		var document = imported != null ? imported : sample ? ResumeSample.document() : ResumeDocument.blank();
		var made = insert(ownerId, id, title == null || title.isBlank() ? "My Resume" : title.strip(), document,
				kind == null ? ResumeKind.RESUME : kind);
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

	/** The Resume's text as Markdown, the same text the Resume's own Markdown endpoint and Export give. */
	public String markdown(ResumeDocument document) {
		return ResumeText.markdown(document);
	}

	/**
	 * A page of the User's Resumes whose title contains {@code q} (all when empty), by "updated" (default), "name" or
	 * "created". A null {@code kind} lists both RESUMEs and CVs; otherwise only that kind.
	 */
	public Page list(UUID ownerId, String q, String sort, ResumeKind kind, int page, int size) {
		var text = q == null ? "" : q.strip();
		var rows = resumes.list(ownerId, text, sort == null ? "" : sort, kind, size, (long) page * size).stream()
				.map(s -> new Row(s.id(), s.title(), s.kind(), s.folderId(), s.createdAt(), s.updatedAt())).toList();
		return new Page(rows, resumes.count(ownerId, text, kind));
	}

	/** Moves the Resume to the Trash, where Restore brings it back unchanged; its versions leave with it for good. */
	public void trash(UUID ownerId, UUID id) {
		if (!resumes.softDelete(ownerId, id, clock.instant())) {
			throw notFound();
		}
	}

	@Transactional
	public Resume save(UUID ownerId, UUID id, String title, ResumeDocument document, int seenVersion) {
		return save(ownerId, id, title, document, seenVersion, false, false);
	}

	/** An Agent's save: the same checks as any save, and the document it replaces is always kept as a version. */
	@Transactional
	public Resume saveByAgent(UUID ownerId, UUID id, String title, ResumeDocument document, int seenVersion) {
		return save(ownerId, id, title, document, seenVersion, true, false);
	}

	/**
	 * A save keeps the document it replaces as a version first (in the same transaction, so a refused save keeps
	 * nothing). With {@code keepOld} it always keeps it (an Agent's edit, a restore). With {@code restoring} it also does
	 * not look at the photo again: a restore brings back something the User once had, even a photo whose Asset has gone
	 * since.
	 */
	private Resume save(UUID ownerId, UUID id, String title, ResumeDocument document, int seenVersion, boolean keepOld,
			boolean restoring) {
		// Missing, or someone else's, is 404 before anything else is looked at.
		var stored = get(ownerId, id);
		if (!restoring) {
			requirePhoto(ownerId, stored.document().basics().photo().assetId(), document.basics().photo().assetId());
		}
		var clean = ResumeText.clean(document);
		var json = checked(clean);
		if (versions.keep(ownerId, id, seenVersion, keepOld || restoring)) {
			versions.prune(ownerId, id);
		}
		if (!resumes.save(ownerId, id, seenVersion, title.strip(), json, ResumeText.plain(clean), ResumeText.markdown(clean))) {
			// Missing (or someone else's) is 404; otherwise it is locked, or it moved on since the caller read it.
			throwIfLocked(get(ownerId, id));
			throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
					"This Resume was changed somewhere else since you opened it.");
		}
		return get(ownerId, id);
	}

	// shortcut: not paged, a Resume keeps at most coreex.resumes.versions.keep (50) unnamed versions plus the named ones.
	public List<ResumeVersionRepository.Version> versions(UUID ownerId, UUID id) {
		get(ownerId, id);
		return versions.list(ownerId, id);
	}

	public ResumeVersionRepository.Version version(UUID ownerId, UUID id, UUID versionId) {
		return versions.find(ownerId, id, versionId).orElseThrow(ResumeService::versionNotFound);
	}

	/** Keeps the Resume as it is stored now under a name; it is never cleaned up. */
	@Transactional
	public ResumeVersionRepository.Version nameCurrent(UUID ownerId, UUID id, String name) {
		get(ownerId, id);
		var made = versions.keepNamed(ownerId, id, name.strip()).orElseThrow(ResumeService::notFound);
		return version(ownerId, id, made);
	}

	/** Sets the name of a version, or clears it when blank (it then counts and expires like any other). */
	public void renameVersion(UUID ownerId, UUID id, UUID versionId, String name) {
		if (!versions.rename(ownerId, id, versionId, name == null || name.isBlank() ? null : name.strip())) {
			throw versionNotFound();
		}
	}

	/** Saves an earlier document as the Resume. The document it replaces is kept, so a restore can be undone. */
	@Transactional
	public Resume restore(UUID ownerId, UUID id, UUID versionId, int seenVersion) {
		var old = version(ownerId, id, versionId);
		return save(ownerId, id, old.title(), old.document(), seenVersion, true, true);
	}

	private static ApiException versionNotFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "There is no such version of the Resume.");
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
		// A photo whose Asset has gone is not carried over: the copy would otherwise name an Asset it cannot show.
		var photo = source.document().basics().photo().assetId();
		var document = photo.isEmpty() || resumes.isImageAsset(ownerId, UUID.fromString(photo)) ? source.document() : source.document().withoutPhoto();
		return get(ownerId, insert(ownerId, null, title + " (copy)", document, ResumeKind.RESUME));
	}

	/** Makes the independent Resume for an Application using a caller-assigned id. */
	@Transactional
	public Resume copyForJob(UUID ownerId, UUID sourceId, UUID copyId) {
		var source = get(ownerId, sourceId);
		var title = source.title().length() > MAX_TITLE - 7 ? source.title().substring(0, MAX_TITLE - 7) : source.title();
		var photo = source.document().basics().photo().assetId();
		var doc = photo.isEmpty() || resumes.isImageAsset(ownerId, UUID.fromString(photo)) ? source.document() : source.document().withoutPhoto();
		var made = insert(ownerId, copyId, title + " (copy)", doc, ResumeKind.RESUME);
		if (made == null) throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT", "That copy id is already used.");
		return get(ownerId, made);
	}

	/**
	 * A photo that is new must be one of the User's own live image Assets; the same refusal for another User's, a PDF and
	 * an id that is nothing, so it says nothing about whose it is. A photo the Resume already has is not looked at again,
	 * so an Asset that was trashed since cannot stop the Resume from being saved.
	 */
	private void requirePhoto(UUID ownerId, String stored, String wanted) {
		if (!wanted.isEmpty() && !wanted.equals(stored) && !resumes.isImageAsset(ownerId, UUID.fromString(wanted))) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "That photo is not one of your image Assets.");
		}
	}

	private UUID insert(UUID ownerId, UUID id, String title, ResumeDocument document, ResumeKind kind) {
		var clean = ResumeText.clean(document);
		return resumes.insert(ownerId, id, title, checked(clean), ResumeText.plain(clean), ResumeText.markdown(clean), kind)
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
