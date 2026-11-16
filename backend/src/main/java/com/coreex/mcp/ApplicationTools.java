package com.coreex.mcp;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.stereotype.Component;

import com.coreex.applications.Application;
import com.coreex.applications.Application.CloseReason;
import com.coreex.applications.Application.EntryType;
import com.coreex.applications.Application.Stage;
import com.coreex.applications.ApplicationService;

import io.modelcontextprotocol.common.McpTransportContext;

/**
 * What an Agent can do with Applications. Like the other tools, each goes through the service with the calling User's
 * id, so the REST API's rules apply: another User's Application is "no such Application", a Stage move writes its
 * timeline entry, a change from an old version is refused. An Agent does not have to send a version: without one the
 * change applies to the Application as it is.
 */
@Component
class ApplicationTools {

	// As the Application REST API's limits (ApplicationController); repeated here, as Input does for the others.
	private static final int NAME_MAX = 90;

	private static final int TITLE_MAX = 200;

	private static final int LOCATION_MAX = 200;

	private static final int URL_MAX = 2000;

	private static final int POSTING_MAX = 100_000;

	private static final int NOTE_MAX = 5000;

	private static final int PAGE = 50;

	private static final Pattern WEB_URL = Pattern.compile("(?i)(https?://\\S*)?");

	record Summary(UUID id, String title, String company, String role, String location, String postingUrl, Stage stage,
			CloseReason closeReason, UUID folderId, int version, Instant updatedAt) {
	}

	record NextStepInfo(String label, boolean due) {
	}

	record Entry(String type, Stage stage, Instant at, int seq, String text, String kind) {
	}

	record Detail(UUID id, String title, String company, String role, String location, String postingUrl,
			String postingText, Stage stage, CloseReason closeReason, Instant appliedOn, LocalDate reminderOn,
			LocalTime reminderTime, NextStepInfo nextStep, List<Entry> timeline, UUID folderId, int version,
			Instant updatedAt) {
	}

	record Row(UUID id, String title, Stage stage, NextStepInfo nextStep, Instant updatedAt) {
	}

	record Listed(List<Row> applications, int total, Integer nextPage) {
	}

	private final ApplicationService applications;

	ApplicationTools(ApplicationService applications) {
		this.applications = applications;
	}

	private static UUID owner(McpTransportContext context) {
		return McpConfig.agent(context).user().id();
	}

	private static Summary summary(Application a) {
		return new Summary(a.id(), a.title(), a.company(), a.role(), a.location(), a.postingUrl(), a.stage(),
				a.closeReason(), a.folderId(), a.version(), a.updatedAt());
	}

	private static String url(String value) {
		var text = Input.optional("postingUrl", value, URL_MAX);
		if (text != null && !WEB_URL.matcher(text).matches()) {
			throw Input.invalid("postingUrl must start with http:// or https://.");
		}
		return text;
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "create_application", description = "Track a new job as an Application, in the Saved Stage. Needs the company and the role; its title becomes 'Role at Company'. Returns the id and the version (1). Pass an id you made up (a UUID) to make a retry safe: sending the same call again returns that Application as it is, with nothing applied twice, instead of making a second one.")
	Summary createApplication(McpTransportContext context,
			@McpToolParam(description = "The company") String company, @McpToolParam(description = "The role") String role,
			@McpToolParam(required = false, description = "Where the job is") String location,
			@McpToolParam(required = false, description = "The link to the posting (http or https)") String postingUrl,
			@McpToolParam(required = false, description = "The posting's text, kept as the employer wrote it") String postingText,
			@McpToolParam(required = false, description = "An id you make up (a UUID), so a retried call returns the same Application instead of making another") UUID id) {
		var made = applications.create(owner(context), Input.required("company", company, NAME_MAX),
				Input.required("role", role, NAME_MAX), orEmpty(Input.optional("location", location, LOCATION_MAX)),
				orEmpty(url(postingUrl)), orEmpty(Input.optional("postingText", postingText, POSTING_MAX)), id);
		return summary(made.application());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "get_application", description = "Read one Application in full: its fields, the posting, its Stage, what it needs from the User now (nextStep, worked out in UTC) and its whole timeline, oldest first. You need its version to change it with update_application.")
	Detail getApplication(McpTransportContext context, @McpToolParam(description = "The Application's id") UUID id) {
		var user = owner(context);
		var a = applications.get(user, id);
		var next = applications.nextStep(a, ZoneOffset.UTC);
		return new Detail(a.id(), a.title(), a.company(), a.role(), a.location(), a.postingUrl(), a.postingText(),
				a.stage(), a.closeReason(), a.appliedOn(), a.reminderOn(), a.reminderTime(),
				new NextStepInfo(next.label(), next.due()),
				a.timeline().stream().map(e -> new Entry(e.type(), e.stage(), e.at(), e.seq(), e.text(), e.kind())).toList(),
				a.folderId(), a.version(), a.updatedAt());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "list_applications", description = "List the User's Applications grouped by Stage and, within a Stage, the ones that need the User now first. Use stage to see one Stage, needsYou for only those that need the User now. Returns 50 at a time: nextPage is the page to ask for next, if any.")
	Listed listApplications(McpTransportContext context,
			@McpToolParam(required = false, description = "Only this Stage: SAVED, APPLIED, SCREENING, INTERVIEW, OFFER or CLOSED") Stage stage,
			@McpToolParam(required = false, description = "true for only the Applications that need the User now") Boolean needsYou,
			@McpToolParam(required = false, description = "The page, starting at 0") Integer page) {
		var at = page == null || page < 0 ? 0 : page;
		var user = owner(context);
		var listed = applications.list(user, at, PAGE, Boolean.TRUE.equals(needsYou), ZoneOffset.UTC, stage);
		var rows = listed.items().stream().map(a -> {
			var next = applications.nextStep(a, ZoneOffset.UTC);
			return new Row(a.id(), a.title(), a.stage(), new NextStepInfo(next.label(), next.due()), a.updatedAt());
		}).toList();
		return new Listed(rows, listed.total(), (at + 1) * PAGE < listed.total() ? at + 1 : null);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "update_application", description = "Change an Application's fields; leave out what should stay as it is. Its title follows the role and company until someone renames it. Pass the version you read with get_application to be sure nothing changed meanwhile: if it did, nothing is saved and you get a conflict. Without a version the change applies to the Application as it is.")
	Summary updateApplication(McpTransportContext context, @McpToolParam(description = "The Application's id") UUID id,
			@McpToolParam(required = false, description = "The version from get_application") Integer version,
			@McpToolParam(required = false, description = "A new company") String company,
			@McpToolParam(required = false, description = "A new role") String role,
			@McpToolParam(required = false, description = "A new location; empty clears it") String location,
			@McpToolParam(required = false, description = "A new posting link (http or https); empty clears it") String postingUrl,
			@McpToolParam(required = false, description = "The posting's text; empty clears it") String postingText,
			@McpToolParam(required = false, description = "A new title; naming one stops the title following the role and company") String title) {
		var user = owner(context);
		var current = applications.get(user, id);
		var saved = applications.save(user, id,
				title == null ? current.title() : Input.required("title", title, TITLE_MAX),
				company == null ? current.company() : Input.required("company", company, NAME_MAX),
				role == null ? current.role() : Input.required("role", role, NAME_MAX),
				location == null ? current.location() : orEmpty(Input.optional("location", location, LOCATION_MAX)),
				postingUrl == null ? current.postingUrl() : orEmpty(url(postingUrl)),
				postingText == null ? current.postingText() : orEmpty(Input.optional("postingText", postingText, POSTING_MAX)),
				version == null ? current.version() : version);
		return summary(saved);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "move_application_stage", description = "Move an Application to a Stage (SAVED, APPLIED, SCREENING, INTERVIEW, OFFER or CLOSED). It writes a line on the timeline, dated today unless you give a date (never a future one); the first move into APPLIED sets the applied date. CLOSED needs closeReason (ACCEPTED, NOT_SELECTED, WITHDREW, ACCEPTED_ANOTHER or NO_RESPONSE); no other Stage takes one. Pass the version you read with get_application to be sure nothing changed meanwhile.")
	Summary moveApplicationStage(McpTransportContext context, @McpToolParam(description = "The Application's id") UUID id,
			@McpToolParam(description = "The Stage to move to") Stage stage,
			@McpToolParam(required = false, description = "Why it closed; only with CLOSED") CloseReason closeReason,
			@McpToolParam(required = false, description = "The day it happened, as 2026-11-20; by default today") LocalDate date,
			@McpToolParam(required = false, description = "The version from get_application") Integer version) {
		var user = owner(context);
		var current = applications.get(user, id);
		return summary(applications.moveStage(user, id, stage, closeReason, date, null,
				version == null ? current.version() : version));
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "add_application_note", description = "Add a note to an Application's timeline, dated today unless you give a date (never a future one). Use it to record what happened: a call, an email, what was said.")
	Summary addApplicationNote(McpTransportContext context, @McpToolParam(description = "The Application's id") UUID id,
			@McpToolParam(description = "The note") String text,
			@McpToolParam(required = false, description = "The day it happened, as 2026-11-20; by default today") LocalDate date,
			@McpToolParam(required = false, description = "The version from get_application") Integer version) {
		var user = owner(context);
		var current = applications.get(user, id);
		return summary(applications.addEntry(user, id, EntryType.NOTE, Input.required("text", text, NOTE_MAX), date,
				version == null ? current.version() : version));
	}

	private static String orEmpty(String value) {
		return value == null ? "" : value;
	}

}
