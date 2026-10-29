package com.coreex.assets;

import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.common.ErrorBody;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping(value = "/api/assets", produces = MediaType.APPLICATION_JSON_VALUE)
class AssetController {

	private static final String JSON = MediaType.APPLICATION_JSON_VALUE;

	// Postgres cannot store a NUL character in text.
	private static final String NO_NUL = "[^\\u0000]*";

	record UploadIntentRequest(@NotBlank @Size(max = 200) @Pattern(regexp = NO_NUL) String filename,
			@NotNull @Size(max = 100) String mimeType, @NotNull @Positive Long sizeBytes,
			@Schema(nullable = true, description = "The Folder to put the Asset in; null is the top level") UUID folderId) {

		// File names often carry spaces; trim before validation.
		UploadIntentRequest {
			filename = filename == null ? null : filename.trim();
		}

	}

	record UploadIntentResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID uploadId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "PUT the file here, with its Content-Type") String uploadUrl) {
	}

	record UpdateAssetRequest(@NotBlank @Size(max = 200) @Pattern(regexp = NO_NUL) String title,
			@NotNull @Size(max = 2000) @Pattern(regexp = NO_NUL) String description) {

		UpdateAssetRequest {
			title = title == null ? null : title.trim();
		}

	}

	record AssetResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String description,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String mimeType,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long sizeBytes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) UUID folderId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt) {

		static AssetResponse of(Asset asset) {
			return new AssetResponse(asset.id(), asset.title(), asset.description(), asset.mimeType(),
					asset.sizeBytes(), asset.folderId(), asset.updatedAt());
		}

	}

	record AssetUrlResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String url,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long expiresInSeconds) {
	}

	record UsageResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Bytes used, trashed Assets included") long usedBytes,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) long quotaBytes) {
	}

	private final AssetService assets;

	AssetController(AssetService assets) {
		this.assets = assets;
	}

	/** Step 1 of an upload: checks type, size and quota, then returns where to PUT the file. */
	@PostMapping(value = "/uploads", consumes = JSON)
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "Where to PUT the file", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = UploadIntentResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND: no such Folder", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "413", description = "Code FILE_TOO_LARGE or QUOTA_EXCEEDED", content = @Content(
			mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "415", description = "Code UNSUPPORTED_TYPE", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "429", description = "Code TOO_MANY_UPLOADS", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "503", description = "Code STORAGE_UNAVAILABLE", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	UploadIntentResponse createUpload(
			@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@Valid @RequestBody UploadIntentRequest request) {
		var upload = assets.createUpload(user, request.filename(), request.mimeType(), request.sizeBytes(),
				request.folderId());
		return new UploadIntentResponse(upload.id(), upload.url().toString());
	}

	/** Step 3 of an upload: checks the stored file's real size and type, then creates the Asset. */
	@PostMapping("/uploads/{uploadId}/confirm")
	@ResponseStatus(HttpStatus.CREATED)
	@ApiResponse(responseCode = "201", description = "The new Asset", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = AssetResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's upload)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "409", description = "Code UPLOAD_MISSING: the file is not in Storage yet",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "413", description = "Code FILE_TOO_LARGE or QUOTA_EXCEEDED (the upload is discarded)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "415", description = "Code UNSUPPORTED_TYPE (the upload is discarded)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "503", description = "Code STORAGE_UNAVAILABLE", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	AssetResponse confirm(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID uploadId) {
		return AssetResponse.of(assets.confirm(user, uploadId));
	}

	/** Storage used against the quota. Declared before the {id} routes only for readability; the path is literal. */
	@GetMapping("/usage")
	UsageResponse usage(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		var usage = assets.usage(user);
		return new UsageResponse(usage.usedBytes(), usage.quotaBytes());
	}

	@GetMapping("/{id}")
	@ApiResponse(responseCode = "200", description = "The Asset", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = AssetResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Asset)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	AssetResponse get(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		return AssetResponse.of(assets.get(user, id));
	}

	/** A short-lived link to view the file (default) or download it. Only the owner gets one. */
	@GetMapping("/{id}/url")
	@ApiResponse(responseCode = "200", description = "A presigned URL", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = AssetUrlResponse.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Asset)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "503", description = "Code STORAGE_UNAVAILABLE", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	AssetUrlResponse url(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @RequestParam(defaultValue = "false") boolean download) {
		var url = assets.url(user, id, download);
		return new AssetUrlResponse(url.url().toString(), url.expiresInSeconds());
	}

	@PutMapping(value = "/{id}", consumes = JSON)
	@ApiResponse(responseCode = "200", description = "The updated Asset", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = AssetResponse.class)))
	@ApiResponse(responseCode = "400", description = "Code INVALID_REQUEST", content = @Content(mediaType = JSON,
			schema = @Schema(implementation = ErrorBody.class)))
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Asset)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	AssetResponse update(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody UpdateAssetRequest request) {
		return AssetResponse.of(assets.update(user, id, request.title(), request.description()));
	}

	/** Moves the Asset to the Trash; the file stays until the Trash purges it. */
	@DeleteMapping("/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@ApiResponse(responseCode = "204", description = "Moved to the Trash")
	@ApiResponse(responseCode = "404", description = "Code NOT_FOUND (also for another User's Asset)",
			content = @Content(mediaType = JSON, schema = @Schema(implementation = ErrorBody.class)))
	void delete(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) {
		assets.delete(user, id);
	}

}
