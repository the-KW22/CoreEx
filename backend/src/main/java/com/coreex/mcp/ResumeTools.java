package com.coreex.mcp;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.ai.mcp.annotation.McpTool;
import org.springframework.ai.mcp.annotation.McpToolParam;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.coreex.common.ApiException;
import com.coreex.items.ItemService;
import com.coreex.resumes.Resume;
import com.coreex.resumes.ResumeDocument;
import com.coreex.resumes.ResumeKind;
import com.coreex.resumes.ResumeService;

import io.modelcontextprotocol.common.McpTransportContext;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.NullNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * What an Agent can do with Resumes. Reading goes through ResumeService as the calling User, so another User's Resume is
 * "no such Resume". An edit is a JSON Patch (RFC 6902) on the Resume's document: it is applied to the document's JSON,
 * the result is read back into the records, and then it is saved like any save (sanitised, checked, the save counter
 * compared). Anything that fails changes nothing.
 */
@Component
class ResumeTools {

	// shortcut: at most 100 operations in one patch, so one call cannot do unbounded work; raise it if an Agent needs more.
	static final int MAX_OPERATIONS = 100;

	private static final int PAGE = 50;

	private static final JsonMapper JSON = JsonMapper.builder().build();

	// shortcut: move and copy are refused (an Agent replaces a value instead), add them when an Agent needs to reorder a list.
	private static final Set<String> OPERATIONS = Set.of("add", "replace", "remove", "test");

	// The fields of the document itself. Anything else (the id, the owner, the save counter) is not part of it.
	private static final Set<String> FIELDS = Set.of("locale", "basics", "summary", "sections", "metadata", "privateNotes",
			"ignoredChecks");

	record ResumeRow(UUID id, String title, ResumeKind kind, UUID folderId, Instant updatedAt) {
	}

	record Listed(List<ResumeRow> resumes, long total, Integer nextPage) {
	}

	record ResumeView(UUID id, String title, ResumeKind kind, String markdown, ResumeDocument document, int version, boolean locked,
			UUID folderId, Instant updatedAt) {
	}

	record PatchOperation(@McpToolParam(description = "add, replace, remove or test") String op,
			@McpToolParam(description = "A JSON Pointer into the document, such as /basics/headline, /summary or /sections/- (append)") String path,
			@McpToolParam(required = false, description = "The value for add, replace and test") Object value) {
	}

	record ResumeSaved(UUID id, String title, ResumeKind kind, int version, Instant updatedAt) {
	}

	private final ResumeService resumes;

	private final ItemService items;

	ResumeTools(ResumeService resumes, ItemService items) {
		this.resumes = resumes;
		this.items = items;
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "list_resumes", description = "List the User's Resumes, most recently changed first, 50 at a time: id, title, kind (RESUME or CV), Folder and when each last changed. Pass kind to list only CVs or only Resumes. Use get_resume to read one. nextPage is the page to ask for next, if any.")
	Listed listResumes(McpTransportContext context,
			@McpToolParam(required = false, description = "The page, starting at 0") Integer page,
			@McpToolParam(required = false, description = "RESUME or CV: list only that kind") ResumeKind kind) {
		var at = page == null || page < 0 ? 0 : page;
		var listed = resumes.list(owner(context), "", "updated", kind, at, PAGE);
		return new Listed(listed.items().stream().map(r -> new ResumeRow(r.id(), r.title(), r.kind(), r.folderId(), r.updatedAt())).toList(),
				listed.total(), (long) (at + 1) * PAGE < listed.total() ? at + 1 : null);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "create_resume", description = "Start a new, blank Resume with a title; kind is RESUME (the default) or CV, the master document that cannot be linked to an Application. Then fill it with patch_resume (use the id and version 1 it returns). Pass an id you made up (a UUID) to make a retry safe: sending the same call again returns that Resume as it is, with nothing applied twice, instead of making a second one.")
	ResumeSaved createResume(McpTransportContext context, @McpToolParam(description = "The Resume's title") String title,
			@McpToolParam(required = false, description = "An id you made up (a UUID), so a retry makes no second Resume") UUID id,
			@McpToolParam(required = false, description = "RESUME (the default) or CV") ResumeKind kind) {
		var made = resumes.create(owner(context), id, Input.required("title", title, Input.TITLE_MAX), false, kind, null).resume();
		return new ResumeSaved(made.id(), made.title(), made.kind(), made.version(), made.updatedAt());
	}

	@McpTool(annotations = @McpTool.McpAnnotations(readOnlyHint = true), name = "get_resume", description = "Read one Resume: its Markdown view, its JSON document (the contents and the design, with the fields a patch_resume path names) and its version, the save counter you need to change it with patch_resume. Locked says whether it can be changed at all now.")
	ResumeView getResume(McpTransportContext context, @McpToolParam(description = "The Resume's id") UUID id) {
		var resume = resumes.get(owner(context), id);
		return view(resume);
	}

	@McpTool(annotations = @McpTool.McpAnnotations(destructiveHint = false), name = "patch_resume", description = "Change a Resume with a JSON Patch (RFC 6902): a list of operations, applied in order to the Resume's JSON document, each with op, path and value. op is add, replace, remove or test (move and copy are not supported). path is a JSON Pointer such as /basics/headline, /summary, /sections/0/entries/1/description, or /sections/- to append. Pass the version you read with get_resume: if the Resume changed since, nothing is saved and you get a conflict. The result is checked and cleaned like any save (HTML is sanitised, so no script or event handler survives), and an invalid result, a failed test or a locked Resume changes nothing. A change keeps the Resume's previous version. The id, owner and version are not part of the document, so a patch cannot touch them. At most 100 operations.")
	ResumeSaved patchResume(McpTransportContext context, @McpToolParam(description = "The Resume's id") UUID id,
			@McpToolParam(description = "The version from get_resume") int version,
			@McpToolParam(description = "The JSON Patch operations, applied in order") List<PatchOperation> operations) {
		var agent = McpConfig.agent(context);
		var userId = agent.user().id();
		var current = resumes.get(userId, id);
		if (current.version() != version) {
			throw new ApiException(HttpStatus.CONFLICT, "VERSION_CONFLICT",
					"This Resume was changed somewhere else since you read it. Read it again with get_resume and redo your change.");
		}
		if (operations == null || operations.isEmpty()) {
			throw Input.invalid("Give at least one operation.");
		}
		if (operations.size() > MAX_OPERATIONS) {
			throw Input.invalid("A patch has at most " + MAX_OPERATIONS + " operations.");
		}
		var saved = resumes.saveByAgent(userId, id, current.title(), patched(current.document(), operations), version);
		items.recordAgentEdit(userId, id, agent.tokenName());
		return new ResumeSaved(saved.id(), saved.title(), saved.kind(), saved.version(), saved.updatedAt());
	}

	/** The document with the operations applied to its JSON, read back as the records. Nothing is saved here. */
	static ResumeDocument patched(ResumeDocument document, List<PatchOperation> operations) {
		var tree = JSON.valueToTree(document);
		for (var operation : operations) {
			apply(tree, operation);
		}
		try {
			return JSON.treeToValue(tree, ResumeDocument.class);
		}
		catch (JacksonException e) {
			throw Input.invalid("The patch leaves the Resume invalid, so nothing was changed: " + e.getOriginalMessage());
		}
	}

	private static void apply(JsonNode root, PatchOperation operation) {
		var op = operation.op() == null ? "" : operation.op();
		if (!OPERATIONS.contains(op)) {
			throw Input.invalid("Operation \"" + op + "\" is not supported: use add, replace, remove or test.");
		}
		var path = segments(operation.path());
		if (!FIELDS.contains(path[0])) {
			throw Input.invalid("Path " + operation.path() + " is not part of the Resume's document: only its contents and design can change.");
		}
		var parent = root;
		for (int i = 0; i < path.length - 1; i++) {
			parent = child(parent, path[i], operation.path());
		}
		var last = path[path.length - 1];
		JsonNode value = operation.value() == null ? NullNode.getInstance() : JSON.valueToTree(operation.value());
		if (parent.isObject()) {
			applyToField((ObjectNode) parent, last, op, value, operation.path());
		}
		else {
			applyToElement((ArrayNode) parent, last, op, value, operation.path());
		}
	}

	private static void applyToField(ObjectNode parent, String name, String op, JsonNode value, String path) {
		switch (op) {
			case "add" -> parent.set(name, value);
			case "replace" -> {
				existing(parent.get(name), path, op);
				parent.set(name, value);
			}
			case "remove" -> {
				existing(parent.get(name), path, op);
				parent.remove(name);
			}
			default -> {
				if (!existing(parent.get(name), path, op).equals(value)) {
					throw Input.invalid("The test at " + path + " failed, so nothing was changed.");
				}
			}
		}
	}

	private static void applyToElement(ArrayNode parent, String segment, String op, JsonNode value, String path) {
		if (segment.equals("-") && op.equals("add")) {
			parent.add(value);
			return;
		}
		var index = index(segment, path);
		if (op.equals("add")) {
			if (index > parent.size()) {
				throw Input.invalid("Path " + path + " is past the end of its list.");
			}
			parent.insert(index, value);
			return;
		}
		if (index >= parent.size()) {
			throw Input.invalid("Path " + path + " does not exist.");
		}
		switch (op) {
			case "replace" -> parent.set(index, value);
			case "remove" -> parent.remove(index);
			default -> {
				if (!parent.get(index).equals(value)) {
					throw Input.invalid("The test at " + path + " failed, so nothing was changed.");
				}
			}
		}
	}

	/** The node at a path that must exist; checked for replace, remove and test. */
	private static JsonNode existing(JsonNode node, String path, String op) {
		if (node == null) {
			throw Input.invalid("Path " + path + " does not exist, so " + op + " cannot use it.");
		}
		return node;
	}

	private static JsonNode child(JsonNode node, String segment, String path) {
		JsonNode next = null;
		if (node.isObject()) {
			next = node.get(segment);
		}
		else if (node.isArray()) {
			var index = index(segment, path);
			next = index < node.size() ? node.get(index) : null;
		}
		if (next == null) {
			throw Input.invalid("Path " + path + " does not exist.");
		}
		return next;
	}

	private static int index(String segment, String path) {
		if (!segment.matches("0|[1-9][0-9]{0,8}")) {
			throw Input.invalid("Path " + path + " must name a list position as a number.");
		}
		return Integer.parseInt(segment);
	}

	/** A JSON Pointer (RFC 6901) split into its segments, with ~1 and ~0 unescaped. */
	static String[] segments(String path) {
		if (path == null || !path.startsWith("/")) {
			throw Input.invalid("path must be a JSON Pointer that starts with /, such as /basics/name.");
		}
		return Arrays.stream(path.substring(1).split("/", -1)).map(s -> s.replace("~1", "/").replace("~0", "~"))
				.toArray(String[]::new);
	}

	private ResumeView view(Resume resume) {
		return new ResumeView(resume.id(), resume.title(), resume.kind(), resumes.markdown(resume.document()), resume.document(),
				resume.version(), resume.locked(), resume.folderId(), resume.updatedAt());
	}

	private static UUID owner(McpTransportContext context) {
		return McpConfig.agent(context).user().id();
	}

}
