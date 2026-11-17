package com.coreex.mcp;

import java.util.List;
import java.util.UUID;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.common.ApiException;
import com.coreex.items.ItemService;
import com.coreex.resumes.CoverLetterDocument;
import com.coreex.resumes.CoverLetterService;

import io.modelcontextprotocol.common.McpTransportContext;

/**
 * What an Agent can do with Cover Letters: list, read, start one (optionally taking its sender and look from a Resume)
 * and write it. Everything goes through CoverLetterService as the calling User, so another User's letter or Resume is
 * "not found". An edit sets whole fields and is saved like any save (the body is sanitised, the version compared).
 */
@Component
class CoverLetterTools {

	record LetterRow(UUID id, String title, UUID linkedResumeId, UUID folderId) {
	}

	record Listed(List<LetterRow> coverLetters) {
	}

	record LetterView(UUID id, String title, String markdown, CoverLetterDocument document, int version,
			UUID linkedResumeId, UUID folderId) {
	}

	record LetterSaved(UUID id, String title, int version) {
	}

	private final CoverLetterService letters;

	private final ItemService items;

	CoverLetterTools(CoverLetterService letters, ItemService items) {
		this.letters = letters;
		this.items = items;
	}

	// shortcut: no paging, the whole list comes back as rows; add a page parameter when a User has hundreds of letters.
	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "list_cover_letters", description = "List the User's Cover Letters, most recently changed first: id, title, the Resume it is linked to (if any) and Folder. Use get_cover_letter to read one.")
	Listed listCoverLetters(McpTransportContext context) {
		return new Listed(letters.list(owner(context)).stream()
				.map(l -> new LetterRow(l.id(), l.title(), l.linkedResumeId(), l.folderId())).toList());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "get_cover_letter", description = "Read one Cover Letter: its Markdown view, its JSON document (recipient, date, greeting, body as HTML, signOff, sender and design) and its version, the save counter you need to change it with edit_cover_letter.")
	LetterView getCoverLetter(McpTransportContext context, @McpToolParam(description = "The Cover Letter's id") UUID id) {
		var letter = letters.get(owner(context), id);
		return new LetterView(letter.id(), letter.title(), letter.document().markdown(), letter.document(), letter.version(),
				letter.linkedResumeId(), letter.folderId());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "create_cover_letter", description = "Start a new, empty Cover Letter with a title. Pass resumeId to link it to one of the User's Resumes: its sender details and look then follow that Resume. Write it with edit_cover_letter (use the id and version 1 it returns).")
	LetterSaved createCoverLetter(McpTransportContext context, @McpToolParam(description = "The Cover Letter's title") String title,
			@McpToolParam(required = false, description = "A Resume to link it to") UUID resumeId) {
		var letter = letters.create(owner(context), Input.required("title", title, Input.TITLE_MAX), resumeId, null);
		return new LetterSaved(letter.id(), letter.title(), letter.version());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "edit_cover_letter", description = "Change a Cover Letter: give the fields to set (title, recipient, date, greeting, body, signOff) and leave out what should stay as it is. body is HTML such as <p>paragraph</p>; it is cleaned like any save, so no script survives. Pass the version you read with get_cover_letter: if the letter changed since, nothing is saved and you get a conflict. Each edit keeps the previous version.")
	LetterSaved editCoverLetter(McpTransportContext context, @McpToolParam(description = "The Cover Letter's id") UUID id,
			@McpToolParam(description = "The version from get_cover_letter") int version,
			@McpToolParam(required = false, description = "A new title") String title,
			@McpToolParam(required = false, description = "Who the letter is to") String recipient,
			@McpToolParam(required = false, description = "The date, as text") String date,
			@McpToolParam(required = false, description = "For example \"Dear Hiring Manager,\"") String greeting,
			@McpToolParam(required = false, description = "The letter's text, as HTML paragraphs") String body,
			@McpToolParam(required = false, description = "For example \"Kind regards,\"") String signOff) {
		var agent = McpConfig.agent(context);
		var userId = agent.user().id();
		var current = letters.get(userId, id);
		if (current.version() != version) {
			throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
					"This Cover Letter was changed somewhere else since you read it. Read it again with get_cover_letter and redo your change.");
		}
		if (title == null && recipient == null && date == null && greeting == null && body == null && signOff == null) {
			throw Input.invalid("Give at least one field to change.");
		}
		var was = current.document();
		var document = new CoverLetterDocument(
				pick("recipient", recipient, was.recipient(), 2000), pick("date", date, was.date(), 100),
				pick("greeting", greeting, was.greeting(), 1000), pick("body", body, was.body(), 200000),
				pick("signOff", signOff, was.signOff(), 1000), was.sender(), was.design());
		var saved = letters.saveByAgent(userId, id, title == null ? current.title() : Input.required("title", title, Input.TITLE_MAX),
				version, document);
		items.recordAgentEdit(userId, id, agent.tokenName());
		return new LetterSaved(saved.id(), saved.title(), saved.version());
	}

	private static String pick(String field, String given, String was, int max) {
		return given == null ? was : Input.optional(field, given, max);
	}

	private static UUID owner(McpTransportContext context) {
		return McpConfig.agent(context).user().id();
	}

}
