package com.coreex.career;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

import com.coreex.career.OfferChecks.Check;
import com.coreex.career.OfferService.Offer;
import com.coreex.common.ApiException;
import com.coreex.identity.CurrentUserInterceptor;
import com.coreex.identity.User;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** The Offers of the User's Applications: create, list, edit (keeping the old terms), versions and compare. */
@RestController
@RequestMapping(produces = MediaType.APPLICATION_JSON_VALUE)
class OfferController {

	private static final String NO_NUL = "[^\\u0000]*";

	/** Every term is optional: leave one out, or send null or blank, and it is unknown. */
	record OfferRequest(@Schema(nullable = true, description = "Base pay per pay period") @DecimalMin("0") @Digits(integer = 12, fraction = 2) BigDecimal basePay,
			@Schema(nullable = true, description = "Three letters, such as GBP") @Pattern(regexp = "([A-Z]{3})?") String currency,
			@Schema(nullable = true, description = "YEAR, MONTH or HOUR") @Pattern(regexp = "(YEAR|MONTH|HOUR)?") String payPeriod,
			@Schema(nullable = true) @Size(max = 2000) @Pattern(regexp = NO_NUL) String bonus,
			@Schema(nullable = true) @Size(max = 2000) @Pattern(regexp = NO_NUL) String equity,
			@Schema(nullable = true) @Size(max = 2000) @Pattern(regexp = NO_NUL) String benefits,
			@Schema(nullable = true, description = "yyyy-mm-dd") LocalDate startDate,
			@Schema(nullable = true) @Size(max = 2000) @Pattern(regexp = NO_NUL) String place,
			@Schema(nullable = true, description = "Office days a week, 0 to 5") @Min(0) @Max(5) Integer officeDays,
			@Schema(nullable = true, description = "yyyy-mm-dd") LocalDate respondBy,
			@Schema(nullable = true, description = "The version you saw; required to edit, left out to create") Integer version) {

		OfferTerms terms() {
			return new OfferTerms(basePay, currency, payPeriod, bonus, equity, benefits, startDate, place, officeDays, respondBy);
		}
	}

	record TermsResponse(@Schema(nullable = true) BigDecimal basePay, @Schema(nullable = true) String currency,
			@Schema(nullable = true) String payPeriod, @Schema(nullable = true) String bonus, @Schema(nullable = true) String equity,
			@Schema(nullable = true) String benefits, @Schema(nullable = true) LocalDate startDate, @Schema(nullable = true) String place,
			@Schema(nullable = true) Integer officeDays, @Schema(nullable = true) LocalDate respondBy) {
	}

	record OfferResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID id,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID applicationId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) TermsResponse terms,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant updatedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Flags against the User's Preferences; empty when none are saved") List<Check> checks) {
	}

	record OfferList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Newest first") List<OfferResponse> items) {
	}

	record OfferItem(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) UUID applicationId,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String applicationTitle,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String company,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) String role,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) OfferResponse offer) {
	}

	record AllOffers(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Newest first") List<OfferItem> items) {
	}

	record VersionResponse(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "The version these terms were") int version,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) Instant savedAt,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) TermsResponse terms) {
	}

	record VersionList(@Schema(requiredMode = Schema.RequiredMode.REQUIRED, description = "Newest first") List<VersionResponse> items) {
	}

	record Comparison(@Schema(requiredMode = Schema.RequiredMode.REQUIRED) OfferResponse a,
			@Schema(requiredMode = Schema.RequiredMode.REQUIRED) OfferResponse b) {
	}

	private final OfferService offers;

	OfferController(OfferService offers) {
		this.offers = offers;
	}

	private static TermsResponse terms(OfferTerms t) {
		return new TermsResponse(t.basePay(), t.currency(), t.payPeriod(), t.bonus(), t.equity(), t.benefits(), t.startDate(),
				t.place(), t.officeDays(), t.respondBy());
	}

	private static OfferResponse respond(Offer o) {
		return new OfferResponse(o.id(), o.applicationId(), terms(o.terms()), o.version(), o.updatedAt(), o.checks());
	}

	@PostMapping("/api/applications/{id}/offers")
	@ResponseStatus(HttpStatus.CREATED)
	OfferResponse create(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id,
			@Valid @RequestBody OfferRequest request) {
		return respond(offers.create(user.id(), id, request.terms()));
	}

	@GetMapping("/api/applications/{id}/offers")
	OfferList list(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID id) {
		return new OfferList(offers.list(user.id(), id).stream().map(OfferController::respond).toList());
	}

	@GetMapping("/api/offers")
	AllOffers all(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user) {
		return new AllOffers(offers.all(user.id()).stream().map(l -> new OfferItem(l.applicationId(), l.applicationTitle(), l.company(),
				l.role(), respond(l.offer()))).toList());
	}

	/** Edits the terms; the version seen is required and the old terms are kept as a version. */
	@PutMapping("/api/offers/{offerId}")
	OfferResponse update(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@PathVariable UUID offerId, @Valid @RequestBody OfferRequest request) {
		if (request.version() == null) {
			throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "Send the version you saw.");
		}
		return respond(offers.update(user.id(), offerId, request.terms(), request.version()));
	}

	@GetMapping("/api/offers/{offerId}/versions")
	VersionList versions(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user, @PathVariable UUID offerId) {
		return new VersionList(offers.versions(user.id(), offerId).stream()
				.map(v -> new VersionResponse(v.version(), v.savedAt(), terms(v.terms()))).toList());
	}

	@GetMapping("/api/offers/compare")
	Comparison compare(@Parameter(hidden = true) @RequestAttribute(CurrentUserInterceptor.ATTRIBUTE) User user,
			@RequestParam("a") UUID a, @RequestParam("b") UUID b) {
		var pair = offers.compare(user.id(), a, b);
		return new Comparison(respond(pair.a()), respond(pair.b()));
	}

}
