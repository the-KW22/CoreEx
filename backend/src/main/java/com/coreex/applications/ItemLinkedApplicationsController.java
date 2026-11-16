package com.coreex.applications;

import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;
import io.swagger.v3.oas.annotations.Parameter;

@RestController
@RequestMapping("/api/items/{id}/linked-applications")
class ItemLinkedApplicationsController {

	private final ApplicationLinkedDocuments links;
	ItemLinkedApplicationsController(ApplicationLinkedDocuments links) { this.links = links; }

	@GetMapping
	List<ApplicationLinkedDocuments.LinkedApplication> list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID id) { return links.forItem(user.id(), id); }
}
