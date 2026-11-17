package com.coreex.career;

import java.time.Clock;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.coreex.applications.ApplicationService;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.servlet.http.HttpServletRequest;

/** The Today page: what needs the User now and what is coming up, worked out when it is asked for. */
@RestController
@RequestMapping("/api/career/today")
class TodayController {

	record EntryResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID applicationId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String title,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) TodayLists.Kind kind,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Ready to show, with any time in the User's timezone") String label,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true) Instant at,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, nullable = true, description = "Set for an interview") Integer interviewSeq,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "An interview starting within 24 hours: Today offers the briefing and Practice") boolean withinDay) {
		static EntryResponse of(TodayLists.Entry e) {
			return new EntryResponse(e.applicationId(), e.title(), e.kind(), e.label(), e.at(), e.interviewSeq(), e.withinDay());
		}
	}

	record TodayResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<EntryResponse> needsYou,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) List<EntryResponse> comingUp) {
	}

	private final ApplicationService applications;

	private final OfferService offers;

	private final Clock clock;

	private final HttpServletRequest request;

	TodayController(ApplicationService applications, OfferService offers, Clock clock, HttpServletRequest request) {
		this.applications = applications;
		this.offers = offers;
		this.clock = clock;
		this.request = request;
	}

	@GetMapping
	TodayResponse today(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		var today = TodayLists.of(applications.all(user.id()), offers.deadlines(user.id()), clock.instant(), zone());
		return new TodayResponse(today.needsYou().stream().map(EntryResponse::of).toList(),
				today.comingUp().stream().map(EntryResponse::of).toList());
	}

	/** The User's timezone as the page sent it (X-Timezone); UTC when it is missing or not a zone. */
	private ZoneId zone() {
		var sent = request.getHeader("X-Timezone");
		try {
			return sent == null ? ZoneId.of("UTC") : ZoneId.of(sent);
		}
		catch (DateTimeException e) {
			return ZoneId.of("UTC");
		}
	}

}
