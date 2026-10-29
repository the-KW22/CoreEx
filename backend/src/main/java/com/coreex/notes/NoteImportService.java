package com.coreex.notes;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.coreex.common.ApiException;
import com.coreex.folders.FolderService;
import com.coreex.links.LinkService;

/**
 * Turns uploaded {@code .md} and {@code .txt} files into Notes, one result per file. A bad file is refused on its own
 * and never fails the others. Every Note goes through {@link NoteService#create}, the same path as writing one, so
 * hand-typed Links resolve exactly as they do when editing.
 */
@Service
class NoteImportService {

	enum Status {
		IMPORTED, REFUSED
	}

	record Source(String filename, byte[] bytes) {
	}

	record Result(String filename, Status status, UUID noteId, String title, String code, String message) {
	}

	private static final int MAX_TITLE = 200;

	private final NoteService notes;

	private final FolderService folders;

	private final LinkService links;

	private final NoteImportProperties properties;

	NoteImportService(NoteService notes, FolderService folders, LinkService links, NoteImportProperties properties) {
		this.notes = notes;
		this.folders = folders;
		this.links = links;
		this.properties = properties;
	}

	List<Result> importAll(UUID ownerId, UUID folderId, List<Source> sources) {
		if (sources.isEmpty() || sources.size() > properties.maxFiles()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
					"Send between 1 and " + properties.maxFiles() + " files at a time.");
		}
		if (folderId != null) {
			folders.requireLive(ownerId, folderId);
		}

		var results = new ArrayList<Result>();
		var created = new ArrayList<Note>();
		for (var source : sources) {
			var name = baseName(source.filename());
			try {
				var title = titleOf(name);
				var note = notes.create(ownerId, folderId, title, textOf(name, source.bytes()));
				created.add(note);
				results.add(new Result(source.filename(), Status.IMPORTED, note.id(), note.title(), null, null));
			}
			catch (ApiException refused) {
				results.add(new Result(source.filename(), Status.REFUSED, null, null, refused.code(),
						name + ": " + refused.getMessage()));
			}
		}
		resolveLinksBetweenImportedNotes(ownerId, created);
		return results;
	}

	/**
	 * Files in one batch often link to each other, but a Note could only link to the ones created before it. Now that
	 * they all exist, resolve again with the same rules and the normal save. Only Notes that contain "[[" can change.
	 */
	private void resolveLinksBetweenImportedNotes(UUID ownerId, List<Note> created) {
		for (var note : created) {
			if (note.body().contains("[[")) {
				var rewritten = links.rewriteTitles(ownerId, note.body());
				if (!rewritten.equals(note.body())) {
					notes.save(ownerId, note.id(), note.title(), rewritten, note.version());
				}
			}
		}
	}

	// Browsers send just the name, but a client may send a path.
	private static String baseName(String filename) {
		var name = filename == null ? "" : filename;
		return name.substring(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1).trim();
	}

	private static String titleOf(String name) {
		var dot = name.lastIndexOf('.');
		var title = (dot < 0 ? name : name.substring(0, dot)).replace("\u0000", "").trim();
		return title.length() > MAX_TITLE ? title.substring(0, MAX_TITLE) : title;
	}

	private String textOf(String name, byte[] bytes) {
		var extension = name.toLowerCase(Locale.ROOT);
		if (!extension.endsWith(".md") && !extension.endsWith(".txt")) {
			throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_TYPE",
					"Only .md and .txt files can be imported.");
		}
		if (bytes.length > properties.maxSizeBytes()) {
			throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE",
					"Files can be at most " + properties.maxSizeBytes() / 1_000_000 + " MB.");
		}
		String text;
		try {
			text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
					.onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
		}
		catch (CharacterCodingException e) {
			throw notUtf8();
		}
		// Postgres cannot store a NUL character, and a file with one is not text.
		if (text.indexOf('\u0000') >= 0) {
			throw notUtf8();
		}
		// A byte order mark is an encoding marker some editors add, not part of the text.
		return text.startsWith("﻿") ? text.substring(1) : text;
	}

	private static ApiException notUtf8() {
		return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "NOT_UTF8",
				"The file is not valid UTF-8 text. Save it as UTF-8 and try again.");
	}

}
