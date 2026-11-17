package com.coreex.applications;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import com.coreex.resumes.Resume;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

@RestController
@RequestMapping("/api/applications/{id}")
class ApplicationLinkedDocumentsController {

	record LinkDocument(@NotNull ApplicationLinkedDocuments.Kind kind, @Schema(nullable = true) UUID itemId,
			@Schema(description = "Explicitly replace an unsent linked document") Boolean replaceExisting) { }
	record CopyResume(@NotNull UUID resumeId, @NotNull UUID requestId) { }
	private final ApplicationLinkedDocuments links;

	ApplicationLinkedDocumentsController(ApplicationLinkedDocuments links) { this.links = links; }

	@GetMapping("/linked-documents")
	List<ApplicationLinkedDocuments.LinkedDocument> list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) { return links.list(user.id(), id); }

	@PutMapping("/linked-documents")
	List<ApplicationLinkedDocuments.LinkedDocument> link(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody LinkDocument request) {
		return links.link(user.id(), id, request.kind(), request.itemId(), Boolean.TRUE.equals(request.replaceExisting()));
	}

	@PostMapping("/copy-resume")
	Resume copy(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id, @Valid @RequestBody CopyResume request) {
		return links.copyForJob(user.id(), id, request.resumeId(), request.requestId());
	}
}
