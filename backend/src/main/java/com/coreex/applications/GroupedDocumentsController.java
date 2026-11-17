package com.coreex.applications;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import io.swagger.v3.oas.annotations.Parameter;

@RestController
class GroupedDocumentsController {

	private final ApplicationLinkedDocuments links;
	GroupedDocumentsController(ApplicationLinkedDocuments links) { this.links = links; }

	@GetMapping("/api/career/documents-by-application")
	List<ApplicationLinkedDocuments.GroupedDocument> list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return links.grouped(user.id());
	}
}
