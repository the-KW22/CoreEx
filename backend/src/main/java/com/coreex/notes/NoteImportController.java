package com.coreex.notes;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.coreex.common.ApiException;
import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

@RestController
@RequestMapping(value = "/api/notes/import", produces = MediaType.APPLICATION_JSON_VALUE)
class NoteImportController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	record ImportResultResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String filename,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) NoteImportService.Status status,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The new Note, when IMPORTED") UUID noteId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "The new Note's title, when IMPORTED") String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "UNSUPPORTED_TYPE, FILE_TOO_LARGE or NOT_UTF8, when REFUSED") String code,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Why the file was refused") String message) {

		static ImportResultResponse of(NoteImportService.Result result) {
			return new ImportResultResponse(result.filename(), result.status(), result.noteId(), result.title(),
					result.code(), result.message());
		}

	}

	record ImportResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "One result per file, in the order sent") List<ImportResultResponse> results) {
	}

	private final NoteImportService imports;

	NoteImportController(NoteImportService imports) {
		this.imports = imports;
	}

	/** Imports .md and .txt files as Notes. A bad file is refused on its own; the others are still imported. */
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ApiResponse(responseCode = "200", description = "One result per file", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ImportResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST: no files, or too many", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such Folder (nothing is imported)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "413", description = "Code FILE_TOO_LARGE: a file beyond the transport limit",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	ImportResponse importNotes(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam("files") List<MultipartFile> files,
			@RequestParam(required = false) UUID folderId,
			@RequestParam(required = false) @Parameter(description = "An id you make up for each file's Note, in the order of the files: sending the same import again returns those Notes instead of making new ones") List<UUID> ids)
			throws IOException {
		if (ids != null && ids.size() != files.size()) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Send one id per file, or none.");
		}
		var sources = new ArrayList<NoteImportService.Source>();
		for (int i = 0; i < files.size(); i++) {
			var file = files.get(i);
			sources.add(new NoteImportService.Source(file.getOriginalFilename(), file.getBytes(),
					ids == null ? null : ids.get(i)));
		}
		return new ImportResponse(imports.importAll(user.id(), folderId, sources).stream()
				.map(ImportResultResponse::of).toList());
	}

}
